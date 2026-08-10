import z from 'zod'

export const leaveRoomSchema = z.object({
	type: z.enum(['pc', 'user'], 'Invalid message type'),
	roomNum: z.string().min(3, 'Room Id Is Too Short'),
})

export type JoinRoom = z.infer<typeof leaveRoomSchema>