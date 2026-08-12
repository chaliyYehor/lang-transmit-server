import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/node'

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
