import type { VRMAnimation } from "@pixiv/three-vrm-animation";
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import AmbientLight from "./libs/AmbientLight";
import Audio from "./libs/Audio";
import AudioListener from "./libs/AudioListener";
import Camera3D from "./libs/Camera3D";
import Clock from "./libs/Clock";
import DirectionalLight from "./libs/DirectionalLight";
import HeightMap from "./libs/HeightMap";
import HemisphereLight from "./libs/HemisphereLight";
import Keyboard from "./libs/Keyboard";
import Loader from "./libs/Loader";
import Particle from "./libs/Particle";
import PhysicsWorld from "./libs/PhysicsWorld";
import Render from "./libs/Render";
import Scene from "./libs/Scene";
import Sky from "./libs/Sky";
import VRMAvatar from "./libs/VRMAvatar";
import Vec3 from "./libs/Vec3";
import Water from "./libs/Water";

type WatermelonState = {
	whole: THREE.Group<THREE.Object3DEventMap> | null;
	broken: THREE.Group<THREE.Object3DEventMap> | null;
	radius: number;
	helper?: THREE.LineSegments;
	brokenBlinkElapsed?: number;
	brokenBlinkDuration?: number;
	outOfBoundsTimer?: number;
};

type GameOptions = {
	onReady?: () => void;
};

export default class Game {
	private clock!: Clock;
	private scene!: Scene;
	private renderer!: Render;
	private camera!: Camera3D;
	private keyboard!: Keyboard;
	private loader!: Loader;
	private physicsWorld!: PhysicsWorld;
	private ambient!: AmbientLight;
	private hemisphere!: HemisphereLight;
	private sun!: DirectionalLight;
	private sky!: Sky;
	private water!: Water;
	private heightMap!: HeightMap;
	private heightMapHelper?: THREE.LineSegments;
	private showHeightMapHelper = false;
	private player!: THREE.Group;
	private placeholder!: THREE.Group;
	private batPivot!: THREE.Group;
	private bat!: THREE.Mesh;
	private batHitProxy!: THREE.Object3D;
	private batAnchor?: THREE.Object3D;
	private vrmAvatar: VRMAvatar | null = null;
	private watermelons: WatermelonState[] = [];

	private readonly playerBounds = {
		minX: -80,
		maxX: 80,
		minZ: -80,
		maxZ: 110,
	};
	private playerAngle = 0;
	private readonly playerSpeed = 38;
	private readonly rotationSpeed = THREE.MathUtils.degToRad(160);
	private readonly rotationStep = THREE.MathUtils.degToRad(3);
	private swing = {
		swinging: false,
		timer: 0,
		duration: 0.5,
		cooldown: 0,
		hit: false,
		power: 1,
		canDealDamage: false,
	};
	private readonly swingRestAngle = THREE.MathUtils.degToRad(-120);
	private readonly swingUpperAngle = THREE.MathUtils.degToRad(-40);
	private readonly swingLowerAngle = THREE.MathUtils.degToRad(-240);
	private readonly swingPhaseSplit = 0.45;
	private readonly watermelonBase = new Vec3(0, 80, 32);
	private readonly watermelonScale = 40;
	private readonly brokenWatermelonScale = 20;
	private readonly watermelonPhysicsScale = 1;
	private readonly brokenBlinkDuration = 5;
	private readonly brokenBlinkInterval = 0.18;
	private readonly brokenBlinkAcceleration = 1.8;
	private readonly brokenBlinkGracePeriod = 2;
	private readonly gameDuration = 60;
	private remainingTime = this.gameDuration;
	private gameActive = false;
	private prevPressSpace = false;
	private prevPressEnter = false;
	private prevPressDown = false;
	private cameraDirectionAngle = Math.PI;
	private targetCameraDirectionAngle = Math.PI;
	private isDownKeyHolding = false;
	private audioListener!: AudioListener;
	private swingAudioBuffer?: AudioBuffer;
	private hitAudioBuffer?: AudioBuffer;
	private bgmAudioBuffer?: AudioBuffer;
	private resultAudioBuffer?: AudioBuffer;
	private activeResultAudio?: Audio;
	private finAudioBuffer?: AudioBuffer;
	private bgmAudio?: Audio;
	private treeGLTF?: GLTF;
	private waitAnimation?: VRMAnimation;
	private walkAnimation?: VRMAnimation;
	private swingAnimation?: VRMAnimation;
	private avatarAnimationState: "wait" | "walk" | "swing" | null = null;
	private lastMovementState = false;
	private swingAnimationHold = 0;
	private readonly treeBaseOffset = 40;
	private readonly cameraDirectionLerpSpeed = 4;
	private cameraFollowEnabled = true;
	private watermelonCounter?: HTMLElement | null;
	private timerText?: HTMLElement | null;
	private hudElement?: HTMLElement | null;
	private resultOverlay?: HTMLElement | null;
	private resultMessage?: HTMLElement | null;
	private resultScore?: HTMLElement | null;
	private resultFireworkLayer?: HTMLElement | null;
	private resultFireworkTimers: number[] = [];
	private smashedWatermelonCount = 0;
	private heroHeight = 24;
	private readonly avatarScale = 12;
	private readonly batTargetLength = 1.25;
	private readonly batTargetThickness = 0.04;
	private readonly batHitLengthScale = 12;
	private readonly batHitThicknessScale = 10;
	private readonly batLength = this.batTargetLength * this.avatarScale;
	private readonly batThickness = this.batTargetThickness * this.avatarScale;
	private tmpVec = new Vec3();
	private tmpQuat = new THREE.Quaternion();
	private groundRay = new THREE.Raycaster();
	private groundDirection = new THREE.Vector3(0, -1, 0);
	private watermelonGLTF?: GLTF;
	private brokenWatermelonGLTF?: GLTF;
	private batHitHelper?: THREE.LineSegments;
	private batHitSize: THREE.Vector3 = new THREE.Vector3();
	private batHitOffset: Vec3 = new Vec3();
	private brokenWatermelonPool: THREE.Group<THREE.Object3DEventMap>[] = [];
	private brokenWatermelonHeightOffset = 0;
	private readonly cameraFollowDistance = 85;
	private readonly cameraElevationAngle = THREE.MathUtils.degToRad(30);
	private treeInstances: THREE.Object3D[] = [];
	private activeParticles: Particle[] = [];
	private readonly onReady?: () => void;
	private overlayElement?: HTMLElement;
	private readyOverlay?: HTMLElement;
	private readyText?: HTMLElement;
	private readySequenceId = 0;
	private readonly readyDurationMs = 2200;
	private readonly goDurationMs = 1500;
	private boundsHelper?: THREE.Object3D;

	constructor(options: GameOptions = {}) {
		this.onReady = options.onReady;
	}

	init = async () => {
		this.showLoadingOverlay();
		this.clock = new Clock();
		this.loader = new Loader();
		this.physicsWorld = new PhysicsWorld();
		await this.physicsWorld.init();
		this.scene = new Scene();
		this.renderer = new Render(this.onResize, 0xdaf3ff);
		this.scene.fog = new THREE.Fog(0xf0f6ff, 200, 1400);

		this.camera = new Camera3D(
			new Vec3(-40, 45, 90),
			new Vec3(0, 12, 20),
			0.1,
			1200,
			55,
		);
		const controls = this.camera.createControls(this.renderer);
		if (controls) {
			controls.enableDamping = true;
			controls.enablePan = false;
			controls.minDistance = 45;
			controls.maxDistance = 140;
			controls.maxPolarAngle = Math.PI / 2.1;
			controls.target.set(0, 12, 0);
			controls.addEventListener("start", () => {
				this.cameraFollowEnabled = false;
			});
		}
		this.audioListener = new AudioListener();
		this.camera.add(this.audioListener);

		this.keyboard = new Keyboard();
		this.createHUD();
		this.setupUI();
		await this.loadAssets();
		this.createEnvironment();
		this.playBGM();
		this.warmupBrokenWatermelonShaders();
		await this.createPlayer();
		this.cameraDirectionAngle = this.targetCameraDirectionAngle =
			this.playerAngle;
		this.placeCameraBehindPlayer(true);
		this.resetWatermelon();

		this.hudElement?.removeAttribute("hidden");
		this.hideLoadingOverlay();
		this.onReady?.();

		requestAnimationFrame(this.loop);
	};

	private createHUD = () => {
		if (document.getElementById("hud")) {
			return;
		}
		const hud = document.createElement("aside");
		hud.id = "hud";
		const counter = document.createElement("p");
		counter.id = "watermelonCounter";
		counter.textContent = "🍉 0";
		const timer = document.createElement("p");
		timer.id = "timerText";
		timer.textContent = `残り: ${this.gameDuration}s`;
		hud.append(timer, counter);
		hud.setAttribute("hidden", "true");
		this.hudElement = hud;
		document.body.appendChild(hud);
	};

	private setupUI = () => {
		this.watermelonCounter = document.getElementById("watermelonCounter");
		this.updateWatermelonCounter();
		this.timerText = document.getElementById("timerText");
		this.updateTimerDisplay();
	};

	private updateTimerDisplay = () => {
		if (!this.timerText) {
			return;
		}
		const seconds = Math.max(0, Math.ceil(this.remainingTime));
		this.timerText.textContent = `残り: ${seconds}s`;
	};

	private ensureResultOverlay = () => {
		if (this.resultOverlay) {
			return this.resultOverlay;
		}
		const overlay = document.createElement("div");
		overlay.id = "resultOverlay";
		overlay.setAttribute("hidden", "true");
		const panel = document.createElement("div");
		panel.className = "result-panel";
		const heading = document.createElement("p");
		heading.className = "result-heading";
		heading.textContent = "タイムアップ";
		const score = document.createElement("p");
		score.id = "resultScore";
		score.textContent = "🍉 0個";
		const message = document.createElement("p");
		message.id = "resultMessage";
		message.textContent = "まずは1個割ってみよう";
		const restartButton = document.createElement("button");
		restartButton.id = "restartButton";
		restartButton.type = "button";
		restartButton.textContent = "もう一度挑戦";
		restartButton.addEventListener("click", () => {
			this.resetWatermelon();
		});
		panel.append(heading, score, message, restartButton);
		overlay.appendChild(panel);
		const fireworksLayer = document.createElement("div");
		fireworksLayer.className = "result-fireworks";
		overlay.appendChild(fireworksLayer);
		document.body.appendChild(overlay);
		this.resultOverlay = overlay;
		this.resultMessage = message;
		this.resultScore = score;
		this.resultFireworkLayer = fireworksLayer;
		return overlay;
	};

	private showResultOverlay = (finalCount: number) => {
		const overlay = this.ensureResultOverlay();
		if (!overlay) {
			return;
		}
		if (this.resultScore) {
			this.resultScore.textContent = `🍉 ${finalCount}個`;
		}
		if (this.resultMessage) {
			this.resultMessage.textContent = this.getResultMessage(finalCount);
		}
		overlay.removeAttribute("hidden");
		this.triggerResultFireworks(finalCount);
	};

	private hideResultOverlay = () => {
		if (!this.resultOverlay) {
			return;
		}
		this.resultOverlay.setAttribute("hidden", "true");
		this.clearResultFireworks();
	};

	private stopResultAudio = () => {
		if (!this.activeResultAudio) {
			return;
		}
		const sound = this.activeResultAudio;
		this.activeResultAudio = undefined;
		sound.stop();
	};

	private getResultMessage = (count: number) => {
		if (count >= 15) {
			return "伝説のスイカハンター！";
		}
		if (count >= 10) {
			return "超爽快スイング！";
		}
		if (count >= 5) {
			return "いい調子、そのまま続けよう";
		}
		if (count >= 1) {
			return "ウォーミングアップ完了！";
		}
		return "まだ割れていない…まずは1個狙おう";
	};

	private ensureLoadingOverlay = () => {
		if (!this.overlayElement) {
			const overlay = document.createElement("div");
			overlay.id = "loadingOverlay";
			overlay.setAttribute("hidden", "true");
			overlay.innerHTML =
				'<div class="spinner"></div><p>ゲームを読み込み中...</p>';
			document.body.appendChild(overlay);
			this.overlayElement = overlay;
		}
		return this.overlayElement;
	};

	private showLoadingOverlay = () => {
		const overlay = this.ensureLoadingOverlay();
		overlay.removeAttribute("hidden");
	};

	private hideLoadingOverlay = () => {
		this.overlayElement?.setAttribute("hidden", "true");
	};

	private ensureReadyOverlay = () => {
		if (this.readyOverlay && this.readyText) {
			return this.readyOverlay;
		}
		const overlay = document.createElement("div");
		overlay.id = "readyOverlay";
		overlay.setAttribute("hidden", "true");
		const text = document.createElement("p");
		text.id = "readyText";
		overlay.appendChild(text);
		document.body.appendChild(overlay);
		this.readyOverlay = overlay;
		this.readyText = text;
		return overlay;
	};

	private startReadySequence = () => {
		const overlay = this.ensureReadyOverlay();
		const text = this.readyText;
		if (!overlay || !text) {
			this.beginGameplay();
			return;
		}
		this.readySequenceId += 1;
		const currentSequence = this.readySequenceId;
		overlay.removeAttribute("hidden");
		text.classList.remove("go");
		text.classList.add("ready");
		text.textContent = "Ready";
		const readyDuration = this.readyDurationMs;
		const goDuration = this.goDurationMs;
		window.setTimeout(() => {
			if (currentSequence !== this.readySequenceId || !this.readyText) {
				return;
			}
			this.readyText.textContent = "GO!";
			this.readyText.classList.remove("ready");
			this.readyText.classList.add("go");
		}, readyDuration);
		window.setTimeout(() => {
			if (currentSequence !== this.readySequenceId) {
				return;
			}
			overlay.setAttribute("hidden", "true");
			this.readyText?.classList.remove("ready", "go");
			this.beginGameplay();
		}, readyDuration + goDuration);
	};

	private beginGameplay = () => {
		if (this.gameActive) {
			return;
		}
		this.gameActive = true;
	};

	private playBGM = () => {
		if (!this.bgmAudioBuffer || !this.audioListener || this.bgmAudio) {
			return;
		}
		const bgm = new Audio(this.bgmAudioBuffer, this.audioListener);
		bgm.setLoop(true);
		bgm.setVolume(0.35);
		this.camera.add(bgm);
		bgm.play();
		this.bgmAudio = bgm;
	};

	private pauseBGM = () => {
		if (!this.bgmAudio || !this.bgmAudio.isPlaying) {
			return;
		}
		this.bgmAudio.pause();
	};

	private resumeBGM = () => {
		if (this.bgmAudio) {
			if (!this.bgmAudio.isPlaying) {
				this.bgmAudio.play();
			}
			return;
		}
		this.playBGM();
	};

	private createEnvironment = () => {
		this.ambient = new AmbientLight(0x54626f);
		this.scene.add(this.ambient);
		this.hemisphere = new HemisphereLight(0xfffff1, 0x4d6b70, 0.75);
		this.scene.add(this.hemisphere);

		this.sun = new DirectionalLight(
			new Vec3(-120, 180, 80),
			512,
			0xffffff,
			1024,
		);
		this.sun.intensity = 1.1;
		this.scene.add(this.sun);

		this.sky = new Sky();
		this.sky.setEnv({
			turbidity: 10,
			rayleigh: 2,
			mieCoefficient: 0.005,
			mieDirectionalG: 0.8,
		});
		this.sky.setLight(this.sun);
		this.scene.add(this.sky);

		this.heightMap = new HeightMap(192, 600, -18, 26, 1.1);
		const heightOffset =
			(this.heightMap.terrainMaxHeight + this.heightMap.terrainMinHeight) / 2;
		this.heightMap.position.set(0, -heightOffset, 0);
		this.heightMap.material = new THREE.MeshStandardMaterial({
			color: 0xfce6c4,
			roughness: 0.78,
			metalness: 0.04,
			emissive: new THREE.Color(0xf2d8b2),
			emissiveIntensity: 0.06,
		});
		this.scene.add(this.heightMap);
		if (this.showHeightMapHelper) {
			const helperGeom = new THREE.EdgesGeometry(
				this.heightMap.geometry.clone(),
			);
			const helperMat = new THREE.LineDashedMaterial({
				color: 0x0096ff,
				dashSize: 10,
				gapSize: 6,
				depthTest: false,
			});
			this.heightMapHelper = new THREE.LineSegments(helperGeom, helperMat);
			this.heightMapHelper.computeLineDistances();
			this.heightMap.add(this.heightMapHelper);
		}
		this.physicsWorld.addHeightMapBody(this.heightMap, this.heightMap.position);

		this.water = new Water(this.sun, 0x3fb3cf, 0xffffff, true, 1600);
		const waterHeight =
			this.heightMap.position.y + this.heightMap.getWorldMinHeight() + 2;
		this.water.position.y = waterHeight;
		this.water.setEnv({ distortionScale: 1.8, alpha: 0.85 });
		this.water.setLight(this.sun);
		this.scene.add(this.water);
		this.spawnTrees(3);
		this.createBoundsHelper();
	};

	private loadAssets = async () => {
		const [
			watermelon,
			broken,
			tree,
			swingAudio,
			hitAudio,
			bgmAudio,
			resultAudio,
			finAudio,
			waitAnim,
			walkAnim,
			swingAnim,
		] = await Promise.all([
			this.loader.loadGLTFModel("./model/watermelon.glb"),
			this.loader.loadGLTFModel("./model/broken_watermelon.glb"),
			this.loader.loadGLTFModel("./model/tree.glb"),
			this.loader.loadAudio("./sounds/swing.mp3"),
			this.loader.loadAudio("./sounds/hit.mp3"),
			this.loader.loadAudio("./sounds/game_bgm.mp3"),
			this.loader.loadAudio("./sounds/result.mp3"),
			this.loader.loadAudio("./sounds/fin.mp3"),
			this.loader.loadVRMAnimation("./model/wait.vrma"),
			this.loader.loadVRMAnimation("./model/walk.vrma"),
			this.loader.loadVRMAnimation("./model/swing.vrma"),
		]);
		this.watermelonGLTF = watermelon;
		this.brokenWatermelonGLTF = broken;
		this.treeGLTF = tree;
		this.swingAudioBuffer = swingAudio;
		this.hitAudioBuffer = hitAudio;
		this.bgmAudioBuffer = bgmAudio;
		this.resultAudioBuffer = resultAudio;
		this.finAudioBuffer = finAudio;
		this.waitAnimation = waitAnim[0];
		this.walkAnimation = walkAnim[0];
		this.swingAnimation = swingAnim[0];
		this.prewarmBrokenWatermelons();
	};

	private createPlayer = async () => {
		this.player = new THREE.Group();
		this.player.position.set(0, 0, -50);

		this.placeholder = new THREE.Group();
		const body = new THREE.Mesh(
			new THREE.BoxGeometry(8, 12, 6),
			new THREE.MeshStandardMaterial({ color: 0x2a2927, roughness: 0.7 }),
		);
		body.position.y = 12;
		body.castShadow = true;
		body.receiveShadow = true;
		this.placeholder.add(body);

		const head = new THREE.Mesh(
			new THREE.SphereGeometry(4, 24, 24),
			new THREE.MeshStandardMaterial({ color: 0xffe3c2 }),
		);
		head.position.y = 20;
		head.castShadow = true;
		this.placeholder.add(head);

		const blindfold = new THREE.Mesh(
			new THREE.BoxGeometry(8.5, 1.4, 4.2),
			new THREE.MeshStandardMaterial({ color: 0x101c2c }),
		);
		blindfold.position.set(0, 20, 0);
		this.placeholder.add(blindfold);

		const legs = new THREE.Mesh(
			new THREE.BoxGeometry(8, 8, 5.8),
			new THREE.MeshStandardMaterial({ color: 0x4158a6 }),
		);
		legs.position.y = 4;
		legs.castShadow = true;
		this.placeholder.add(legs);
		this.player.add(this.placeholder);

		this.batPivot = new THREE.Group();
		this.batPivot.position.set(0, 13, 1.6);
		this.player.add(this.batPivot);

		const batHolder = new THREE.Group();
		this.batPivot.add(batHolder);

		const batGeometry = new THREE.BoxGeometry(
			this.batThickness,
			this.batThickness,
			this.batLength,
		);
		batGeometry.translate(0, 0, this.batLength / 2);
		this.bat = new THREE.Mesh(
			batGeometry,
			new THREE.MeshStandardMaterial({ color: 0xd5c4a1, roughness: 0.4 }),
		);
		this.bat.castShadow = true;
		batHolder.add(this.bat);
		this.batPivot.rotation.x = this.swingRestAngle;

		this.scene.add(this.player);
		await this.loadHeroModel();
		this.snapPlayerToGround();
		this.createBatPhysics();
		this.updateLocomotionAnimation(false);
	};

	private playAvatarAnimation = (state: "wait" | "walk" | "swing") => {
		if (this.avatarAnimationState === state) {
			return undefined;
		}
		if (!this.vrmAvatar) {
			return undefined;
		}
		let animation: VRMAnimation | undefined;
		switch (state) {
			case "wait":
				animation = this.waitAnimation;
				break;
			case "walk":
				animation = this.walkAnimation;
				break;
			case "swing":
				animation = this.swingAnimation;
				break;
		}
		if (!animation) {
			return undefined;
		}
		const timeScale = 2;
		const duration = this.vrmAvatar.play(animation, {
			loopOnce: state === "swing",
			timeScale,
		});
		this.avatarAnimationState = state;
		return duration;
	};

	private updateLocomotionAnimation = (moving: boolean) => {
		this.lastMovementState = moving;
		if (this.swing.swinging || this.swingAnimationHold > 0) {
			return;
		}
		if (moving) {
			this.playAvatarAnimation("walk");
		} else {
			this.playAvatarAnimation("wait");
		}
	};

	private loadHeroModel = async () => {
		try {
			const vrm = await this.loader.loadVRM("./model/void.vrm");
			this.vrmAvatar?.dispose();
			this.vrmAvatar = new VRMAvatar(vrm);
			this.vrmAvatar.init(new Vec3(0, 0, 0), Math.PI, this.avatarScale);
			this.player.add(this.vrmAvatar.object);
			this.alignAvatarToGround();
			this.attachBatToHand();
			if (this.placeholder) {
				this.player.remove(this.placeholder);
			}
		} catch (error) {
			console.warn("void.vrmの読み込みに失敗しました", error);
		}
	};

	private alignAvatarToGround = () => {
		if (!this.vrmAvatar) {
			return;
		}
		this.player.updateWorldMatrix(true, true);
		const box = new THREE.Box3().setFromObject(this.vrmAvatar.object);
		if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) {
			return;
		}
		const offsetY = -box.min.y;
		this.vrmAvatar.object.position.y += offsetY;
		this.vrmAvatar.object.updateMatrixWorld(true);
		const height = Math.max(1, box.max.y - box.min.y);
		this.heroHeight = height;
		this.batPivot.position.y = height * 0.55;
		this.batPivot.position.z = Math.max(1.6, height * 0.08 + 1.2);
		this.snapPlayerToGround();
	};

	private attachBatToHand = () => {
		if (!this.vrmAvatar) {
			return;
		}
		const hand = this.vrmAvatar.getHumanoidBoneNode("rightHand");
		if (!hand) {
			return;
		}
		if (!this.batAnchor) {
			this.batAnchor = new THREE.Object3D();
		}
		hand.add(this.batAnchor);
		const invScale = 1 / this.avatarScale;
		this.batAnchor.position.set(
			-0.9 * invScale,
			-0.5 * invScale,
			-1.2 * invScale,
		);
		this.batAnchor.rotation.set(0, 0, 0);
		this.batAnchor.scale.setScalar(invScale);
		this.player.add(this.batPivot);
		this.batPivot.scale.setScalar(1);
		this.batPivot.rotation.set(this.swingRestAngle, 0.05, Math.PI / 2);
		this.updateBatAnchorFollow();
	};

	private createBatPhysics = () => {
		this.bat.updateWorldMatrix(true, true);
		this.batHitProxy = new THREE.Object3D();
		this.scene.add(this.batHitProxy);
		const originalSize = new THREE.Vector3(
			this.batTargetThickness,
			this.batTargetThickness,
			this.batTargetLength,
		);
		this.batHitSize.set(
			originalSize.x * this.batHitThicknessScale,
			originalSize.y * this.batHitThicknessScale,
			originalSize.z * this.batHitLengthScale,
		);
		this.batHitOffset.set(0, 0, this.batHitSize.z * 0.5);
		const helperGeom = new THREE.BoxGeometry(
			this.batHitSize.x,
			this.batHitSize.y,
			this.batHitSize.z,
		);
		helperGeom.rotateZ(Math.PI / 2);
		helperGeom.translate(0, this.batHitSize.y * 0.5, 0);
		const helperEdges = new THREE.EdgesGeometry(helperGeom);
		const helperMaterial = new THREE.LineBasicMaterial({
			color: 0xff0000,
			depthTest: false,
			transparent: true,
			opacity: 0.85,
		});
		this.batHitHelper = new THREE.LineSegments(helperEdges, helperMaterial);
		this.batHitHelper.visible = false;
		// this.batHitProxy.add(this.batHitHelper);
		this.physicsWorld.addBoxBody(
			this.batHitProxy,
			new Vec3(this.batHitSize.x, this.batHitSize.y, this.batHitSize.z),
			1,
			true,
		);
		this.syncBatPhysics();
	};

	private syncBatPhysics = () => {
		if (!this.batHitProxy) {
			return;
		}
		this.bat.updateWorldMatrix(true, true);
		this.tmpVec.copy(this.batHitOffset);
		this.bat.localToWorld(this.tmpVec);
		this.batHitProxy.position.copy(this.tmpVec);
		this.bat.getWorldQuaternion(this.tmpQuat);
		this.batHitProxy.quaternion.copy(this.tmpQuat);
		this.physicsWorld.setPhysicsPose(this.batHitProxy);
	};

	private updateBatAnchorFollow = () => {
		if (!this.batAnchor) {
			return;
		}
		this.batAnchor.updateWorldMatrix(true, true);
		this.tmpVec.setFromMatrixPosition(this.batAnchor.matrixWorld);
		this.player.worldToLocal(this.tmpVec);
		this.batPivot.position.copy(this.tmpVec);
	};

	private resetWatermelon = () => {
		this.hideResultOverlay();
		this.stopResultAudio();
		this.resumeBGM();
		this.clearWatermelons();
		this.smashedWatermelonCount = 0;
		this.updateWatermelonCounter();
		this.remainingTime = this.gameDuration;
		this.updateTimerDisplay();
		this.gameActive = false;
		this.swing.swinging = false;
		this.swing.timer = 0;
		this.swing.hit = false;
		this.swing.canDealDamage = false;
		this.swing.cooldown = 0;
		this.swingAnimationHold = 0;
		this.batPivot.rotation.x = this.swingRestAngle;
		const spawnCount = 3;
		this.spawnWatermelonsFromSky(spawnCount);
		this.startReadySequence();
		this.updateLocomotionAnimation(false);
	};

	private createWatermelonState = (
		withHelper = false,
	): WatermelonState | null => {
		if (!this.watermelonGLTF) {
			return null;
		}
		const watermelonMesh = this.watermelonGLTF.scene.clone(true);
		watermelonMesh.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});
		watermelonMesh.scale.setScalar(this.watermelonScale);
		watermelonMesh.updateMatrixWorld(true);
		const bounds = new THREE.Box3().setFromObject(watermelonMesh);
		const size = new THREE.Vector3();
		bounds.getSize(size);
		const boxCenter = new THREE.Vector3();
		bounds.getCenter(boxCenter);
		const visualRadius = Math.max(size.x, size.z) * 0.5;
		const physicsRadius = visualRadius * this.watermelonPhysicsScale;
		const watermelon = new THREE.Group();
		watermelon.add(watermelonMesh);
		watermelonMesh.position.sub(boxCenter);
		let helper: THREE.LineSegments | undefined;
		if (withHelper) {
			const helperGeom = new THREE.SphereGeometry(1, 16, 16);
			const helperEdges = new THREE.EdgesGeometry(helperGeom);
			const helperMaterial = new THREE.LineBasicMaterial({
				color: 0x00ff00,
				depthTest: false,
				transparent: true,
				opacity: 0.75,
			});
			helper = new THREE.LineSegments(helperEdges, helperMaterial);
			helper.scale.setScalar(physicsRadius);
			watermelon.add(helper);
		}
		return {
			whole: watermelon,
			broken: null,
			radius: physicsRadius,
			helper,
			outOfBoundsTimer: 0,
		};
	};

	private clearWatermelons = () => {
		for (const pair of this.watermelons) {
			if (pair.whole) {
				this.physicsWorld.removeBody(pair.whole);
				this.scene.remove(pair.whole);
			}
			if (pair.broken) {
				this.recycleBrokenWatermelon(pair.broken);
				pair.broken = null;
			}
			pair.brokenBlinkElapsed = undefined;
			pair.brokenBlinkDuration = undefined;
		}
		this.watermelons = [];
	};

	private registerWatermelonPair = (pair: WatermelonState, mass: number) => {
		if (!pair.whole) {
			return;
		}
		this.scene.add(pair.whole);
		this.physicsWorld.addSphereBody(
			pair.whole,
			pair.radius,
			mass,
			false,
			false,
		);
		const body = pair.whole.userData.physicsBody;
		if (body) {
			body.setDamping(1, 1);
			body.setRestitution(0);
			body.setFriction(1);
			body.setSleepingThresholds(0.01, 0.01);
		}
		this.watermelons.push(pair);
	};

	private spawnWatermelonsFromSky = (count: number) => {
		for (let i = 0; i < count; i++) {
			const pair = this.createWatermelonState();
			if (!pair || !pair.whole) {
				continue;
			}
			const position = this.findSafeSpawnPosition(pair.radius);
			pair.whole.position.set(position.x, position.y, position.z);
			this.registerWatermelonPair(pair, 10);
		}
	};

	private clearTrees = () => {
		for (const tree of this.treeInstances) {
			this.scene.remove(tree);
		}
		this.treeInstances = [];
	};

	private createBoundsHelper = () => {
		if (this.boundsHelper) {
			this.scene.remove(this.boundsHelper);
		}
		const { minX, maxX, minZ, maxZ } = this.playerBounds;
		const offset = 0.4;
		const y1 = this.getGroundHeightAt(
			minX,
			minZ,
			this.heightMap?.position.y ?? 0,
		);
		const y2 = this.getGroundHeightAt(
			maxX,
			minZ,
			this.heightMap?.position.y ?? 0,
		);
		const y3 = this.getGroundHeightAt(
			maxX,
			maxZ,
			this.heightMap?.position.y ?? 0,
		);
		const y4 = this.getGroundHeightAt(
			minX,
			maxZ,
			this.heightMap?.position.y ?? 0,
		);
		const plateau = Math.max(y1, y2, y3, y4) + offset;
		const corners = [
			new THREE.Vector3(minX, plateau, minZ),
			new THREE.Vector3(maxX, plateau, minZ),
			new THREE.Vector3(maxX, plateau, maxZ),
			new THREE.Vector3(minX, plateau, maxZ),
		];
		const segments: Array<[THREE.Vector3, THREE.Vector3]> = [
			[corners[0], corners[1]],
			[corners[1], corners[2]],
			[corners[2], corners[3]],
			[corners[3], corners[0]],
		];
		const group = new THREE.Group();
		for (const [start, end] of segments) {
			const dir = end.clone().sub(start);
			const length = Math.hypot(dir.x, dir.z);
			const geometry = new THREE.BoxGeometry(length, 1.5, 1.5);
			const material = new THREE.MeshBasicMaterial({
				color: 0xffaa00,
				transparent: true,
				opacity: 0.85,
			});
			const mesh = new THREE.Mesh(geometry, material);
			const mid = start.clone().add(end).multiplyScalar(0.5);
			mesh.position.copy(mid);
			mesh.rotation.y = Math.atan2(dir.z, dir.x);
			group.add(mesh);
		}
		this.boundsHelper = group;
		this.scene.add(group);
	};

	private spawnTrees = (count: number) => {
		if (!this.treeGLTF || !this.heightMap) {
			return;
		}
		this.clearTrees();
		const areaRadius = Math.max(
			Math.abs(this.playerBounds.minX),
			Math.abs(this.playerBounds.maxX),
			Math.abs(this.playerBounds.minZ),
			Math.abs(this.playerBounds.maxZ),
		);
		const maxRadius = Math.min(
			(this.heightMap.terrainGeometoryWidth ?? 600) * 0.5 - 20,
			(this.heightMap.terrainGeometoryDepth ?? 600) * 0.5 - 20,
		);
		const innerRadius = Math.min(areaRadius + 30, maxRadius - 20);
		const outerRadius = Math.max(innerRadius + 30, innerRadius + 10);
		for (let i = 0; i < count; i++) {
			const tree = this.treeGLTF.scene.clone(true);
			tree.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.castShadow = true;
					child.receiveShadow = true;
				}
			});
			tree.rotation.y = Math.random() * Math.PI * 2;
			tree.scale.setScalar(18);
			tree.position.set(0, 0, 0);
			tree.updateMatrixWorld(true);
			const newRadius = 20;
			let position: THREE.Vector3 | null = null;
			let baseHeight = 0;
			for (let attempt = 0; attempt < 30; attempt++) {
				const angle = Math.random() * Math.PI * 2;
				const radius = THREE.MathUtils.randFloat(innerRadius, outerRadius);
				const x = Math.cos(angle) * radius;
				const z = Math.sin(angle) * radius;
				if (Math.abs(x) > maxRadius || Math.abs(z) > maxRadius) {
					continue;
				}
				if (
					this.treeInstances.every((treeInstance) => {
						const dx = treeInstance.position.x - x;
						const dz = treeInstance.position.z - z;
						const required =
							(treeInstance.userData.treeRadius ?? 18) + newRadius + 6;
						return dx * dx + dz * dz > required * required;
					})
				) {
					const groundY = this.getGroundHeightAt(
						x,
						z,
						this.heightMap.position.y,
					);
					position = new THREE.Vector3(x, groundY, z);
					baseHeight = groundY;
					break;
				}
			}
			if (!position) {
				continue;
			}
			tree.position.set(
				position.x,
				baseHeight + this.treeBaseOffset,
				position.z,
			);
			this.scene.add(tree);
			tree.userData.treeRadius = newRadius;
			this.treeInstances.push(tree);
		}
	};

	private removeWatermelonState = (state: WatermelonState) => {
		if (state.whole) {
			this.physicsWorld.removeBody(state.whole);
			this.scene.remove(state.whole);
		}
		if (state.broken) {
			this.scene.remove(state.broken);
		}
		const index = this.watermelons.indexOf(state);
		if (index >= 0) {
			this.watermelons.splice(index, 1);
		}
	};

	private findSafeSpawnPosition = (radius: number) => {
		const attempts = 32;
		let fallback: { x: number; y: number; z: number } | null = null;
		for (let i = 0; i < attempts; i++) {
			const candidate = this.buildSpawnCandidate();
			if (!fallback) {
				fallback = candidate;
			}
			if (this.isSpawnPositionClear(candidate.x, candidate.z, radius)) {
				return candidate;
			}
		}
		return fallback ?? this.buildSpawnCandidate();
	};

	private buildSpawnCandidate = () => {
		const rangeX =
			Math.abs(this.playerBounds.maxX - this.playerBounds.minX) * 0.5 - 20;
		const rangeZ =
			Math.abs(this.playerBounds.maxZ - this.playerBounds.minZ) * 0.5 - 20;
		const x =
			this.watermelonBase.x + THREE.MathUtils.randFloatSpread(rangeX * 2);
		const z =
			this.watermelonBase.z + THREE.MathUtils.randFloatSpread(rangeZ * 2);
		const y = this.watermelonBase.y + 150 + Math.random() * 150;
		return { x, y, z };
	};

	private isSpawnPositionClear = (x: number, z: number, radius: number) => {
		const minGap = 8;
		for (const state of this.watermelons) {
			const target = state.whole;
			if (!target) {
				continue;
			}
			const dx = target.position.x - x;
			const dz = target.position.z - z;
			const combinedRadius = radius + state.radius + minGap;
			if (dx * dx + dz * dz < combinedRadius * combinedRadius) {
				return false;
			}
		}
		return true;
	};

	private loop = () => {
		requestAnimationFrame(this.loop);
		this.render();
	};

	private render = () => {
		const { delta } = this.clock.update();
		this.updateTimer(delta);
		this.updatePlayer(delta);
		this.updateSwing(delta);
		this.updatePhysics(delta);
		this.updateBrokenWatermelons(delta);
		this.updateParticles(delta);
		this.water?.update(delta * 0.5);
		this.vrmAvatar?.update(delta);
		this.updateBatAnchorFollow();
		this.updateCamera(delta);

		this.renderer.clear(true, true, true);
		this.renderer.render(this.scene, this.camera);
	};

	private updateTimer = (delta: number) => {
		if (!this.gameActive) {
			return;
		}
		const previous = this.remainingTime;
		this.remainingTime = Math.max(0, this.remainingTime - delta);
		if (Math.ceil(previous) !== Math.ceil(this.remainingTime)) {
			this.updateTimerDisplay();
		}
		if (this.remainingTime <= 0) {
			this.handleTimeUp();
		}
	};

	private handleTimeUp = () => {
		if (!this.gameActive) {
			return;
		}
		const finalCount = this.smashedWatermelonCount;
		this.gameActive = false;
		this.remainingTime = 0;
		this.updateTimerDisplay();
		this.pauseBGM();
		this.stopResultAudio();
		const resultSound = this.playSound(this.resultAudioBuffer, 0.9, () => {
			if (this.activeResultAudio === resultSound) {
				this.activeResultAudio = undefined;
			}
		});
		if (resultSound) {
			this.activeResultAudio = resultSound;
		}
		this.showResultOverlay(finalCount);
		this.updateLocomotionAnimation(false);
		this.swingAnimationHold = 0;
	};

	private updatePlayer = (delta: number) => {
		const enterPressed = this.keyboard.isPressEnter();
		if (enterPressed && !this.prevPressEnter) {
			this.resetWatermelon();
		}
		this.prevPressEnter = enterPressed;

		if (!this.gameActive) {
			return;
		}
		let rotated = false;
		if (this.keyboard.isPressA() || this.keyboard.isPressLeft()) {
			this.playerAngle += this.rotationSpeed * delta;
			rotated = true;
		}
		if (this.keyboard.isPressD() || this.keyboard.isPressRight()) {
			this.playerAngle -= this.rotationSpeed * delta;
			rotated = true;
		}
		if (rotated) {
			this.playerAngle = this.normalizeAngle(
				Math.round(this.playerAngle / this.rotationStep) * this.rotationStep,
			);
		}

		const downPressed =
			(this.keyboard.isPressS() || this.keyboard.isPressDown()) &&
			!(this.keyboard.isPressW() || this.keyboard.isPressUp());
		if (downPressed && !this.prevPressDown) {
			this.playerAngle = this.normalizeAngle(this.playerAngle + Math.PI);
			this.isDownKeyHolding = true;
		}
		if (!downPressed && this.prevPressDown) {
			this.isDownKeyHolding = false;
			this.targetCameraDirectionAngle = this.playerAngle;
		}
		this.prevPressDown = downPressed;

		let moved = false;
		const forward = new Vec3(
			Math.sin(this.playerAngle),
			0,
			Math.cos(this.playerAngle),
		);
		if (this.keyboard.isPressW() || this.keyboard.isPressUp()) {
			this.player.position.add(
				forward.clone().multiplyScalar(this.playerSpeed * delta),
			);
			moved = true;
		}
		if (this.keyboard.isPressS() || this.keyboard.isPressDown()) {
			const direction = this.isDownKeyHolding ? 1 : -1;
			this.player.position.add(
				forward.clone().multiplyScalar(direction * this.playerSpeed * delta),
			);
			moved = true;
		}

		if ((moved || rotated) && !this.cameraFollowEnabled) {
			this.resumeCameraFollow();
		}
		this.player.position.x = THREE.MathUtils.clamp(
			this.player.position.x,
			this.playerBounds.minX,
			this.playerBounds.maxX,
		);
		this.player.position.z = THREE.MathUtils.clamp(
			this.player.position.z,
			this.playerBounds.minZ,
			this.playerBounds.maxZ,
		);
		this.player.rotation.y = this.playerAngle + Math.PI;
		if (!this.isDownKeyHolding) {
			this.targetCameraDirectionAngle = this.playerAngle;
		}

		this.snapPlayerToGround();
		this.updateLocomotionAnimation(moved);
	};

	private updateSwing = (delta: number) => {
		this.swingAnimationHold = Math.max(0, this.swingAnimationHold - delta);
		if (!this.gameActive) {
			return;
		}
		const spacePressed = this.keyboard.isPressSpace();
		if (
			spacePressed &&
			!this.prevPressSpace &&
			!this.swing.swinging &&
			this.swing.cooldown <= 0
		) {
			this.startSwing();
		}
		this.prevPressSpace = spacePressed;

		if (this.swing.swinging) {
			this.swing.timer += delta;
			const progress = Math.min(this.swing.timer / this.swing.duration, 1);
			this.batPivot.rotation.x = this.getSwingAngle(progress);
			const activeWindow = progress > 0.2 && progress < 0.95;
			this.swing.canDealDamage = activeWindow && !this.swing.hit;
			if (progress >= 1) {
				this.swing.swinging = false;
				this.swing.cooldown = 0.2;
				this.swing.canDealDamage = false;
				this.updateLocomotionAnimation(this.lastMovementState);
			}
		} else {
			this.swing.cooldown = Math.max(0, this.swing.cooldown - delta);
			this.batPivot.rotation.x = THREE.MathUtils.lerp(
				this.batPivot.rotation.x,
				this.swingRestAngle,
				8 * delta,
			);
			this.swing.canDealDamage = false;
		}
	};

	private startSwing = () => {
		this.swing.swinging = true;
		this.swing.timer = 0;
		this.swing.hit = false;
		this.swing.canDealDamage = false;
		this.swing.power = 1.2;
		this.playSound(this.swingAudioBuffer, 0.65);
		const duration = this.playAvatarAnimation("swing") ?? 0;
		this.swingAnimationHold = duration;
	};

	private breakWatermelon = (state: WatermelonState, contact: Vec3) => {
		if (!state.whole) {
			return;
		}
		this.physicsWorld.removeBody(state.whole);
		this.scene.remove(state.whole);
		state.whole = null;
		this.smashedWatermelonCount += 1;
		this.updateWatermelonCounter();
		this.spawnWatermelonParticles(contact);
		this.spawnBrokenWatermelon(state, contact);
		this.spawnWatermelonsFromSky(1);
	};

	private spawnBrokenWatermelon = (pair: WatermelonState, contact: Vec3) => {
		if (pair.broken) {
			this.recycleBrokenWatermelon(pair.broken);
		}
		const broken = this.acquireBrokenWatermelon();
		if (!broken) {
			return;
		}
		if (!broken.parent) {
			this.scene.add(broken);
		}
		const groundY = this.getGroundHeightAt(contact.x, contact.z, contact.y);
		const heightOffset = this.brokenWatermelonHeightOffset || 0;
		broken.visible = true;
		broken.position.set(contact.x, groundY + heightOffset, contact.z);
		broken.rotation.y = Math.random() * Math.PI * 2;
		pair.broken = broken;
		pair.brokenBlinkElapsed = 0;
		pair.brokenBlinkDuration = this.brokenBlinkDuration;
	};

	private spawnWatermelonParticles = (contact: Vec3) => {
		const count = 16;
		const particle = new Particle(
			"./textures/particle.png",
			count,
			{ h: 0.02, s: 0.75, l: 0.6 },
			7,
		);
		particle.position.copy(contact);
		this.scene.add(particle);
		const velocities = Array.from(
			{ length: count },
			() =>
				new THREE.Vector3(
					THREE.MathUtils.randFloatSpread(40),
					Math.random() * 20 + 10,
					THREE.MathUtils.randFloatSpread(40),
				),
		);
		particle.configureBurst({
			velocities,
			gravity: new THREE.Vector3(0, -45, 0),
			duration: 1.1,
			startOpacity: 0.95,
			endOpacity: 0,
		});
		this.activeParticles.push(particle);
	};

	private buildBrokenWatermelon = () => {
		if (!this.brokenWatermelonGLTF) {
			return null;
		}
		const broken = this.brokenWatermelonGLTF.scene.clone(
			true,
		) as THREE.Group<THREE.Object3DEventMap>;
		broken.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});
		broken.scale.setScalar(this.brokenWatermelonScale);
		broken.updateMatrixWorld(true);
		const bounds = new THREE.Box3().setFromObject(broken);
		const size = new THREE.Vector3();
		bounds.getSize(size);
		if (this.brokenWatermelonHeightOffset === 0) {
			this.brokenWatermelonHeightOffset = size.y * 0.25;
		}
		broken.visible = false;
		broken.position.set(0, -9999, 0);
		broken.rotation.set(0, 0, 0);
		if (!broken.parent) {
			this.scene.add(broken);
		}
		return broken;
	};

	private acquireBrokenWatermelon = () => {
		return this.brokenWatermelonPool.pop() ?? this.buildBrokenWatermelon();
	};

	private recycleBrokenWatermelon = (
		broken: THREE.Group<THREE.Object3DEventMap>,
	) => {
		broken.visible = false;
		broken.position.set(0, -9999, 0);
		broken.rotation.set(0, 0, 0);
		this.brokenWatermelonPool.push(broken);
	};

	private prewarmBrokenWatermelons = (count = 6) => {
		for (let i = 0; i < count; i++) {
			const broken = this.buildBrokenWatermelon();
			if (!broken) {
				return;
			}
			this.brokenWatermelonPool.push(broken);
		}
	};

	private warmupBrokenWatermelonShaders = () => {
		if (!this.renderer || !this.camera) {
			return;
		}
		const sample = this.acquireBrokenWatermelon();
		if (!sample) {
			return;
		}
		const toggledMeshes: { mesh: THREE.Mesh; frustum: boolean }[] = [];
		sample.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				toggledMeshes.push({ mesh: child, frustum: child.frustumCulled });
				child.frustumCulled = false;
			}
		});
		sample.visible = true;
		sample.position.set(
			this.watermelonBase.x,
			this.watermelonBase.y * 0.5,
			this.watermelonBase.z,
		);
		sample.updateMatrixWorld(true);
		this.renderer.compile(this.scene, this.camera);
		const prevTarget = this.renderer.getRenderTarget();
		const tempTarget = new THREE.WebGLRenderTarget(32, 32);
		const prevAutoClear = this.renderer.autoClear;
		this.renderer.setRenderTarget(tempTarget);
		this.renderer.autoClear = true;
		this.renderer.render(this.scene, this.camera);
		this.renderer.autoClear = prevAutoClear;
		this.renderer.setRenderTarget(prevTarget);
		tempTarget.dispose();
		for (const { mesh, frustum } of toggledMeshes) {
			mesh.frustumCulled = frustum;
		}
		this.recycleBrokenWatermelon(sample);
	};

	private snapPlayerToGround = () => {
		const groundY = this.getGroundHeightAt(
			this.player.position.x,
			this.player.position.z,
			this.player.position.y,
		);
		this.player.position.y = groundY + 0.6;
	};

	private getGroundHeightAt = (x: number, z: number, fallback = 0) => {
		if (!this.heightMap) {
			return fallback;
		}
		const origin = this.tmpVec.set(x, 500, z);
		this.groundRay.set(origin, this.groundDirection);
		const intersects = this.groundRay.intersectObject(this.heightMap);
		return intersects[0]?.point.y ?? fallback;
	};

	private updatePhysics = (delta: number) => {
		if (!this.physicsWorld) {
			return;
		}
		this.syncBatPhysics();
		this.physicsWorld.update(delta);
		for (const state of this.watermelons) {
			if (!state.whole) {
				continue;
			}
			this.physicsWorld.setModelPose(
				state.whole as THREE.Object3D & { center?: THREE.Vector3 },
			);
			this.clampWatermelonState(state);
		}
		if (!this.gameActive) {
			return;
		}
		this.resolveBatContacts();
		this.updateWatermelonBoundaries(delta);
	};

	private updateWatermelonBoundaries = (delta: number) => {
		const toRemove: WatermelonState[] = [];
		for (const state of this.watermelons) {
			const mesh = state.whole;
			if (!mesh) {
				continue;
			}
			const outside =
				mesh.position.x < this.playerBounds.minX ||
				mesh.position.x > this.playerBounds.maxX ||
				mesh.position.z < this.playerBounds.minZ ||
				mesh.position.z > this.playerBounds.maxZ;
			if (outside) {
				state.outOfBoundsTimer = (state.outOfBoundsTimer ?? 0) + delta;
				if (state.outOfBoundsTimer > 3) {
					toRemove.push(state);
				}
			} else {
				state.outOfBoundsTimer = 0;
			}
		}
		for (const state of toRemove) {
			this.removeWatermelonState(state);
			this.spawnWatermelonsFromSky(1);
		}
	};

	private resolveBatContacts = () => {
		if (!this.swing.canDealDamage || this.swing.hit || !this.batHitProxy) {
			return;
		}
		for (const state of this.watermelons) {
			const target = state.whole;
			if (!target || !target.userData.physicsBody) {
				continue;
			}
			const hits = this.physicsWorld.hitTest([this.batHitProxy, target], true);
			if (hits.length === 0) {
				continue;
			}
			const first = hits[0];
			let contact: Vec3 | undefined;
			const pt = first.pts?.[0]?.b;
			if (pt) {
				contact = new Vec3(pt.x(), pt.y(), pt.z());
			}
			this.handleWatermelonHit(state, contact);
			break;
		}
	};

	private handleWatermelonHit = (state: WatermelonState, contact?: Vec3) => {
		if (!state.whole) {
			return;
		}
		this.swing.hit = true;
		this.swing.canDealDamage = false;
		const hitPoint = contact ?? state.whole.position.clone();
		this.playSound(this.hitAudioBuffer, 0.75);
		this.breakWatermelon(state, hitPoint);
	};

	private clampWatermelonState = (state: WatermelonState) => {
		if (!state.whole) {
			return;
		}
		const groundY = this.getGroundHeightAt(
			state.whole.position.x,
			state.whole.position.z,
			state.whole.position.y,
		);
		const targetY = groundY + state.radius;
		const delta = state.whole.position.y - targetY;
		if (Math.abs(delta) < 0.1) {
			return;
		}
		state.whole.position.y = THREE.MathUtils.lerp(
			state.whole.position.y,
			targetY,
			0.3,
		);
		this.physicsWorld.setPhysicsPose(
			state.whole as THREE.Object3D & { center?: THREE.Vector3 },
		);
	};

	private updateCamera = (delta: number) => {
		if (!this.camera || !this.player) {
			return;
		}
		if (!this.cameraFollowEnabled) {
			if (this.camera.controls) {
				this.camera.controls.update();
			}
			return;
		}
		const target = this.player.position.clone();
		target.y += this.heroHeight * 0.5;
		const desiredAngle = this.targetCameraDirectionAngle;
		this.cameraDirectionAngle = this.rotateAngleTowards(
			this.cameraDirectionAngle,
			desiredAngle,
			this.cameraDirectionLerpSpeed * delta,
		);
		const forward = new Vec3(
			Math.sin(this.cameraDirectionAngle),
			0,
			Math.cos(this.cameraDirectionAngle),
		);
		const desired = this.computeCameraTargetPose(target, forward);
		this.camera.position.lerp(desired.position, 3 * delta);
		this.camera.lookAt(desired.target);
		if (this.camera.controls) {
			this.camera.controls.target.lerp(desired.target, 4 * delta);
			this.camera.controls.update();
		}
	};

	private placeCameraBehindPlayer = (alignPlayerToCamera = false) => {
		if (!this.camera || !this.player) {
			return;
		}
		const target = this.player.position.clone();
		target.y += this.heroHeight * 0.5;
		if (alignPlayerToCamera) {
			this.cameraDirectionAngle = this.targetCameraDirectionAngle =
				this.playerAngle;
			this.player.rotation.y = this.playerAngle + Math.PI;
		}
		const forward = new Vec3(
			Math.sin(this.cameraDirectionAngle),
			0,
			Math.cos(this.cameraDirectionAngle),
		);
		const desired = this.computeCameraTargetPose(target, forward);
		this.camera.position.copy(desired.position);
		this.camera.lookAt(desired.target);
		if (this.camera.controls) {
			this.camera.controls.target.copy(desired.target);
			this.camera.controls.update();
		}
	};

	private computeCameraTargetPose = (target: Vec3, forward: Vec3) => {
		const horizontal =
			Math.cos(this.cameraElevationAngle) * this.cameraFollowDistance;
		const vertical =
			Math.sin(this.cameraElevationAngle) * this.cameraFollowDistance;
		const position = new Vec3(
			target.x - forward.x * horizontal,
			target.y + vertical,
			target.z - forward.z * horizontal,
		);
		return { position, target };
	};

	private playSound = (
		buffer?: AudioBuffer,
		volume = 0.9,
		onEnded?: () => void,
	): Audio | null => {
		if (!buffer || !this.audioListener || !this.camera) {
			return null;
		}
		const sound = new Audio(buffer, this.audioListener);
		sound.setVolume(volume);
		this.camera.add(sound);
		sound.play();
		const source = sound.source;
		if (source) {
			source.onended = () => {
				this.camera.remove(sound);
				sound.disconnect();
				onEnded?.();
			};
		}
		return sound;
	};

	private updateBrokenWatermelons = (delta: number) => {
		for (const pair of this.watermelons) {
			if (!pair.broken) {
				continue;
			}
			const elapsed = (pair.brokenBlinkElapsed ?? 0) + delta;
			pair.brokenBlinkElapsed = elapsed;
			const duration = pair.brokenBlinkDuration ?? this.brokenBlinkDuration;
			const shouldRecycle = elapsed >= duration;
			if (shouldRecycle) {
				this.recycleBrokenWatermelon(pair.broken);
				pair.broken = null;
				pair.brokenBlinkElapsed = undefined;
				pair.brokenBlinkDuration = undefined;
				continue;
			}
			if (elapsed < this.brokenBlinkGracePeriod) {
				pair.broken.visible = true;
				continue;
			}
			const acceleration = this.brokenBlinkAcceleration;
			const dynamicInterval = Math.max(
				this.brokenBlinkInterval *
					acceleration ** ((elapsed - this.brokenBlinkGracePeriod) / duration),
				this.brokenBlinkInterval * 0.2,
			);
			const phase = Math.floor(
				(elapsed - this.brokenBlinkGracePeriod) / dynamicInterval,
			);
			pair.broken.visible = phase % 2 === 0;
		}
	};

	private updateParticles = (delta: number) => {
		if (this.activeParticles.length === 0) {
			return;
		}
		for (let i = this.activeParticles.length - 1; i >= 0; i--) {
			const particle = this.activeParticles[i];
			particle.update(delta);
			if (particle.hasBurstFinished()) {
				this.scene.remove(particle);
				particle.disposeResources();
				this.activeParticles.splice(i, 1);
			}
		}
	};

	private updateWatermelonCounter = () => {
		if (this.watermelonCounter) {
			this.watermelonCounter.textContent = `🍉 ${this.smashedWatermelonCount}`;
		}
	};

	private getSwingAngle = (progress: number) => {
		const phase = THREE.MathUtils.clamp(this.swingPhaseSplit, 0.05, 0.95);
		if (progress <= phase) {
			const t = phase <= 0 ? 1 : progress / phase;
			const eased = THREE.MathUtils.smoothstep(t, 0, 1);
			return THREE.MathUtils.lerp(
				this.swingRestAngle,
				this.swingUpperAngle,
				eased,
			);
		}
		const t = (progress - phase) / Math.max(1 - phase, 1e-4);
		const eased = THREE.MathUtils.smoothstep(t, 0, 1);
		return THREE.MathUtils.lerp(
			this.swingUpperAngle,
			this.swingLowerAngle,
			eased,
		);
	};

	private triggerResultFireworks = (count: number) => {
		const layer = this.resultFireworkLayer;
		if (!layer) {
			return;
		}
		this.clearResultFireworks();
		if (count < 10) {
			return;
		}
		this.playSound(this.finAudioBuffer, 0.8);
		const bursts = Math.min(36, 12 + Math.floor(count * 1.5));
		for (let i = 0; i < bursts; i++) {
			const spark = document.createElement("span");
			spark.className = "result-firework";
			const hue = Math.floor(Math.random() * 360);
			spark.style.setProperty(
				"--dx",
				`${THREE.MathUtils.randFloatSpread(220)}px`,
			);
			spark.style.setProperty(
				"--dy",
				`${-THREE.MathUtils.randFloat(120, 240)}px`,
			);
			spark.style.color = `hsl(${hue}deg, 85%, 62%)`;
			spark.style.left = `${THREE.MathUtils.randFloat(15, 85)}%`;
			spark.style.top = `${THREE.MathUtils.randFloat(15, 85)}%`;
			const delay = Math.random() * 1.1;
			spark.style.animationDelay = `${delay}s`;
			layer.appendChild(spark);
			const timer = window.setTimeout(
				() => {
					spark.remove();
				},
				(delay + 2.4) * 1000,
			);
			this.resultFireworkTimers.push(timer);
		}
		const cleanup = window.setTimeout(() => {
			this.clearResultFireworks();
		}, 4200);
		this.resultFireworkTimers.push(cleanup);
	};

	private clearResultFireworks = () => {
		for (const timer of this.resultFireworkTimers) {
			window.clearTimeout(timer);
		}
		this.resultFireworkTimers = [];
		if (this.resultFireworkLayer) {
			this.resultFireworkLayer.innerHTML = "";
		}
	};

	private resumeCameraFollow = () => {
		if (!this.camera || !this.player) {
			return;
		}
		const angle = this.deriveCameraAngleFromCurrentPose();
		this.cameraDirectionAngle = angle;
		this.targetCameraDirectionAngle = this.playerAngle;
		this.cameraFollowEnabled = true;
	};

	private deriveCameraAngleFromCurrentPose = () => {
		if (!this.camera || !this.player) {
			return this.playerAngle;
		}
		const offset = new Vec3()
			.copy(this.camera.position as Vec3)
			.sub(this.player.position as Vec3);
		if (offset.lengthSq() < 1e-4) {
			return this.playerAngle;
		}
		return Math.atan2(-offset.x, -offset.z);
	};

	private normalizeAngle = (angle: number) => {
		return (
			THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI
		);
	};

	private rotateAngleTowards = (
		current: number,
		target: number,
		maxDelta: number,
	) => {
		const delta = this.normalizeAngle(target - current);
		if (Math.abs(delta) <= maxDelta) {
			return target;
		}
		return current + Math.sign(delta) * maxDelta;
	};

	private onResize = () => {
		this.renderer.resize();
		this.camera.resize();
	};
}
