import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/node'

const arcjetKey = process.env.ARCJET_KEY

if (!arcjetKey) {
	throw new Error('ArcJet Key Is Not Defined')
}

export const wsArcjet = arcjetKey
	? arcjet({
			key: arcjetKey,
			rules: [
				shield({ mode: 'LIVE' }),
				detectBot({
					mode: 'LIVE',
					allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
				}),
				slidingWindow({ mode: 'LIVE', interval: '2s', max: 5 }),
			],
		})
	: null
