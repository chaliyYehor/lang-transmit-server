import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/node'
import { NextFunction, Request, Response } from 'express'

const arcjetKey = process.env.ARCJET_KEY
const arcjetMode = process.env.ARCJET_ENV === 'development' ? 'DRY_RUN' : 'LIVE'

if (!arcjetKey) {
	throw new Error('ArcJet Key Is Not Defined')
}

export const wsArcjet = arcjetKey
	? arcjet({
			key: arcjetKey,
			rules: [
				shield({ mode: arcjetMode }),
				detectBot({
					mode: arcjetMode,
					allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
				}),
				slidingWindow({ mode: arcjetMode, interval: '2s', max: 5 }),
			],
		})
	: null

export const httpArcjet = arcjetKey
	? arcjet({
			key: arcjetKey,
			rules: [
				shield({ mode: arcjetMode }),
				detectBot({
					mode: arcjetMode,
					allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
				}),
				slidingWindow({ mode: arcjetMode, interval: '20s', max: 50 }),
			],
		})
	: null

export function securityMiddleware() {
	return async (req: Request, res: Response, next: NextFunction) => {
		if (!httpArcjet) return next()

		try {
			const decision = await httpArcjet.protect(req)
			if (decision.isDenied()) {
				if (decision.reason.isRateLimit()) {
					return res.status(429).json({ error: 'Too many requests.' })
				}
				return res.status(403).json({ error: 'Forbidden.' })
			}
		} catch (error) {
			console.error('Arcjet middleware error')
			res.status(503).json({ error: 'Service Unavailable' })
		}

		next()
	}
}
