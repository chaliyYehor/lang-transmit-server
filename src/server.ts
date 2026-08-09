import express from 'express'
import http from 'http'
import 'dotenv/config'
import { Server } from 'socket.io'
import cors from 'cors'
import { joinRoomSchema, messageSchema } from './schemas/joinRoomSchema.js'

const app = express()

const port = process.env.PORT || 5000
const server = http.createServer(app)

app.use(
	cors({
		origin: [process.env.CLIENT_URL || 'http://localhost:5173'],
		methods: ['GET', 'POST', 'PUT', 'DELETE'],
	}),
)

const rooms = new Map<string, { hasPc: boolean }>()

const io = new Server(server, {
	cors: {
		origin: '*',
	},
})

io.on('connection', socket => {
	console.log('connected')

	socket.on(
		'connectToRoom',
		async (
			data,
			cb: (response: { success: boolean; error?: string }) => void,
		) => {
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
		console.log('sdf')
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
			})
		}
	})
})

server.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
