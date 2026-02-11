export default class Keyboard {
	private keys: { [key: number]: boolean };
	private tapUntil: { [key: number]: number };
	constructor() {
		this.keys = [];
		this.tapUntil = [];
		document.addEventListener("keydown", (e: KeyboardEvent) => {
			const keycode = this.resolveKeyCode(e);
			if (keycode === null) return;
			this.keys[keycode] = true;
			// keyDown -> keyUp が短くても1フレーム以上は判定できるようにする
			this.tapUntil[keycode] = performance.now() + 140;
			e.preventDefault();
			e.stopPropagation();
			return false;
		});
		document.addEventListener("keyup", (e: KeyboardEvent) => {
			const keycode = this.resolveKeyCode(e);
			if (keycode === null) return;
			this.keys[keycode] = false;
			e.preventDefault();
			e.stopPropagation();
			return false;
		});
	}

	isPressEnter = () => this.getKey(13);
	isPressSpace = () => this.getKey(32);
	isPressA = () => this.getKey(65);
	isPressD = () => this.getKey(68);
	isPressW = () => this.getKey(87);
	isPressS = () => this.getKey(83);
	isPressC = () => this.getKey(67);
	isPressLeft = () => this.getKey(37);
	isPressRight = () => this.getKey(39);
	isPressUp = () => this.getKey(38);
	isPressDown = () => this.getKey(40);

	getKey = (keycode: number) => {
		return Boolean(this.keys[keycode]) || performance.now() < (this.tapUntil[keycode] ?? 0);
	};

	private resolveKeyCode = (e: KeyboardEvent): number | null => {
		const key = e.key;
		if (key === "Enter") return 13;
		if (key === " " || key === "Spacebar" || key === "Space") return 32;
		if (key === "ArrowLeft" || key === "Left") return 37;
		if (key === "ArrowUp" || key === "Up") return 38;
		if (key === "ArrowRight" || key === "Right") return 39;
		if (key === "ArrowDown" || key === "Down") return 40;

		const code = e.code;
		if (code === "Enter") return 13;
		if (code === "Space") return 32;
		if (code === "ArrowLeft") return 37;
		if (code === "ArrowUp") return 38;
		if (code === "ArrowRight") return 39;
		if (code === "ArrowDown") return 40;

		if (e.keyCode === 13 || e.which === 13) return 13;
		if (e.keyCode === 32 || e.which === 32) return 32;
		if (e.keyCode === 37 || e.which === 37) return 37;
		if (e.keyCode === 38 || e.which === 38) return 38;
		if (e.keyCode === 39 || e.which === 39) return 39;
		if (e.keyCode === 40 || e.which === 40) return 40;
		return null;
	};
}
