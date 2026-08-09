import express from "express";
import http from 'http'
import 'dotenv/config'
import {Server} from 'socket.io'
import cors from 'cors'

const app = express();

const port = process.env.PORT || 5000
const server = http.createServer(app);

app.use(cors({
	origin: [process.env.CLIENT_URL || 'http://localhost:5173'],
	methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))

const io = new Server(server, {
		cors: {
				origin: '*',
		}
})

io.on('connection', (socket) => {
	console.log('connected')
	socket.on('message', data => {
		console.log(data)
		io.emit('message', data)
	})
})

server.listen(port, () => {
		console.log(`Server is running on port ${port}`);
})