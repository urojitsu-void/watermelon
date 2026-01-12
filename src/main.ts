import './style.css'
import Game from './game'

const startButton = document.getElementById('startButton')
const titleImage = document.getElementById('titleImage')

async function init() {
	if (!startButton || startButton.dataset.loading === 'true') {
		return
	}
	startButton.dataset.loading = 'true'
	startButton.setAttribute('disabled', 'true')
	const game = new Game({
		onReady: () => {
			startButton.remove()
			titleImage?.remove()
		},
	})
	await game.init()
}

startButton?.addEventListener('click', () => {
	void init()
})
