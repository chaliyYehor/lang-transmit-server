import express, { Request, Response } from 'express'
import http from 'http'
import 'dotenv/config'
import { Server } from 'socket.io'
import cors from 'cors'
import { joinRoomSchema, messageSchema } from './schemas/joinRoomSchema.js'
import { leaveRoomSchema } from './schemas/leaveRoomSchema.js'
import { wsArcjet } from './arcjet.js'
import helmet from 'helmet'

const app = express()

const port = process.env.PORT || 5000
const server = http.createServer(app)

const allowedOrigins = [
	process.env.CLIENT_URL || 'http://localhost:5173',
	process.env.TAURI_URL || 'http://localhost:3000',
	'https://lang-transmit-client-jj9m72i3h-chaliyyehors-projects.vercel.app',
]

app.set('trust proxy', 1)

app.use(helmet())

app.use(
	cors({
		origin: allowedOrigins,
		methods: ['GET', 'POST', 'PUT', 'DELETE'],
	}),
)

const rooms = new Map<string, { hasPc: boolean }>()

const io = new Server(server, {
	maxHttpBufferSize: 1e4,
	cors: {
		origin: allowedOrigins,
		methods: ['GET', 'POST'],
	},
})

io.use(async (socket, next) => {
	if (!wsArcjet) {
		next()
		return
	}

	try {
		const decision = await wsArcjet.protect(socket.request)

		if (decision.isDenied()) {
			if (decision.reason.isRateLimit()) {
				return next(new Error('Too Many Requests'))
			}

			return next(new Error('Forbidden'))
		}

		next()
	} catch (error) {
		console.error('WebSocket upgrade protection error:', error)

		return next(new Error('Internal Server Error'))
	}
})

io.on('connection', socket => {
	console.log('connected', socket.id)

	socket.on(
		'connectToRoom',
		async (
			data,
			cb: (response: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.log('Callback is not a function')
				return
			}
			const parsed = joinRoomSchema.safeParse(data)

			if (!parsed.success) {
				cb({
					success: false,
					error: parsed.error.issues[0].message,
				})

				return
			}

			const { type, roomNum } = parsed.data

			/*
			 * Этот socket уже находится в этой комнате.
			 *
			 * Такое может произойти из-за React StrictMode,
			 * который в development повторно запускает useEffect.
			 *
			 * Это НЕ второй PC.
			 */
			if (socket.data.type === type && socket.data.roomNum === roomNum) {
				console.log(`Socket ${socket.id} is already in room ${roomNum}`)

				cb({
					success: true,
				})

				return
			}

			/*
			 * Если socket раньше был в другой комнате,
			 * освобождаем старую комнату.
			 */
			if (socket.data.roomNum) {
				const oldRoomNum = socket.data.roomNum
				const oldType = socket.data.type

				socket.leave(oldRoomNum)

				if (oldType === 'pc') {
					const oldRoom = rooms.get(oldRoomNum)

					if (oldRoom) {
						oldRoom.hasPc = false
					}
				}
			}

			/*
			 * Проверяем новую комнату.
			 */
			if (type === 'pc') {
				const room = rooms.get(roomNum)

				if (room?.hasPc) {
					cb({
						success: false,
						error: 'Room already has a PC connected',
					})

					return
				}

				rooms.set(roomNum, {
					hasPc: true,
				})
			} else {
				if (!rooms.has(roomNum)) {
					rooms.set(roomNum, {
						hasPc: false,
					})
				}
			}

			/*
			 * Сохраняем информацию о socket.
			 */
			socket.data.type = type
			socket.data.roomNum = roomNum

			/*
			 * Входим в Socket.IO room.
			 */
			socket.join(roomNum)

			console.log('Rooms:', rooms)

			cb({
				success: true,
			})

			/*
			 * Обновляем количество пользователей.
			 */
			const users = await io.in(roomNum).fetchSockets()

			const usersCount = users.filter(user => user.data.type === 'user').length

			io.to(roomNum).emit('userJoined', {
				usersConnected: usersCount,
				pcConnected: users.some(user => user.data.type === 'pc'),
			})
		},
	)

	socket.on('message', data => {
		const parsed = messageSchema.safeParse(data)
		if (!parsed.success) {
			console.log(parsed.error.issues)
			return
		}
		const { roomNum, lang } = parsed.data
		if (!socket.data.roomNum || socket.data.roomNum !== roomNum) {
			console.log(`Socket ${socket.id} is not in room ${roomNum}`)
			return
		}
		socket.to(roomNum).emit('message', { type: 'lang', data: lang })
	})

	socket.on('disconnect', async () => {
		const { type, roomNum } = socket.data

		if (!roomNum) return

		console.log(`Disconnected: ${type} from room ${roomNum}`)

		if (type === 'pc') {
			const room = rooms.get(roomNum)

			if (room) {
				room.hasPc = false
			}
		}

		const users = await io.in(roomNum).fetchSockets()

		if (users.length === 0) {
			rooms.delete(roomNum)
		} else {
			const usersCount = users.filter(user => user.data.type === 'user').length

			io.to(roomNum).emit('userJoined', {
				usersConnected: usersCount,
				pcConnected: users.some(user => user.data.type === 'pc'),
			})
		}
	})

	socket.on(
		'leaveRoom',
		async (
			data,
			cb: (response: { success: boolean; error?: string }) => void,
		) => {
			const parsed = leaveRoomSchema.safeParse(data)
			if (!parsed.success) {
				cb({ success: false, error: parsed.error.issues[0].message })
				return
			}

			const { type, roomNum } = parsed.data
			const { type: oldType, roomNum: oldRoomNum } = socket.data

			if (!oldRoomNum || !oldType) {
				cb({
					success: false,
					error: 'Socket is not in a room',
				})
				return
			}

			if (oldType !== type || roomNum !== oldRoomNum) {
				cb({ success: false, error: 'Invalid Room Data' })
				return
			}

			if (type === 'pc') {
				const room = rooms.get(oldRoomNum)
				if (room) {
					room.hasPc = false
				}
			}

			socket.leave(oldRoomNum)

			delete socket.data.type
			delete socket.data.roomNum

			const users = await io.in(oldRoomNum).fetchSockets()

			if (users.length === 0) {
				rooms.delete(oldRoomNum)
			} else {
				const usersCount = users.filter(
					user => user.data.type === 'user',
				).length

				io.to(roomNum).emit('userJoined', {
					usersConnected: usersCount,
					pcConnected: users.some(user => user.data.type === 'pc'),
				})
			}
			console.log(
				`User with type: ${type} has successfully left the room: ${roomNum}`,
			)
			cb({
				success: true,
			})
		},
	)
})

app.get('/', (req: Request, res: Response) => {
	res.send('Language Transmit Server is running')
})

server.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
