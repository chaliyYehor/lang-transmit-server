import z from 'zod'

export const joinRoomSchema = z.object({
	type: z.enum(['pc', 'user'], 'Invalid message type'),
	roomNum: z.string().min(3, 'Room Id Is Too Short'),
})

export type JoinRoom = z.infer<typeof joinRoomSchema>

export const messageSchema = z.object({
	roomNum: z.string().min(3, 'Room Id Is Too Short'),
	lang: z.string()
})

export type Message = z.infer<typeof messageSchema>