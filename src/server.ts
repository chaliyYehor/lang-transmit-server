import express from 'express'
import http from 'http'
import 'dotenv/config'
import { Server } from 'socket.io'
import cors from 'cors'
import { joinRoomSchema } from './schemas/joinRoomSchema.js'

const app = express()

const port = process.env.PORT || 5000
const server = http.createServer(app)

app.use(
	cors({
		origin: [process.env.CLIENT_URL || 'http://localhost:5173'],
		methods: ['GET', 'POST', 'PUT', 'DELETE'],
	}),
)

const io = new Server(server, {
	cors: {
		origin: '*',
	},
})

io.on('connection', socket => {
	console.log('connected')

	socket.on('message', (data, cb: (response: { success: boolean; error?: string }) => void) => {
		const parsed = joinRoomSchema.safeParse(data)
		if (!parsed.success) {
			cb({ success: false, error: parsed.error.issues[0].message })
			return
		}
		console.log(parsed.data)
		cb({ success: true })
	})
})

server.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
