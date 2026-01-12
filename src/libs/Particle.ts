import * as THREE from "three";

type BurstState = {
	velocities: THREE.Vector3[];
	offsets: THREE.Vector3[];
	gravity: THREE.Vector3;
	duration: number;
	elapsed: number;
	positions: THREE.BufferAttribute;
	startOpacity: number;
	endOpacity: number;
};

type BurstOptions = {
	velocities: THREE.Vector3[];
	gravity?: THREE.Vector3;
	duration: number;
	startOpacity?: number;
	endOpacity?: number;
};

export default class Particle extends THREE.Points {
	private burstState?: BurstState;

	constructor(
		filename: string,
		num = 1000,
		hslColor = { h: 0.4, s: 0.5, l: 0.5 },
		size = 10,
	) {
		super();
		this.geometry = this.createVertices(num);
		this.material = this.createMaterial(filename, hslColor, size);
	}

	private createVertices = (num: number) => {
		const vertices: number[] = [];
		for (let i = 0; i < num; i++) {
			const x = Math.random() * num * 2 - num;
			const y = Math.random() * num * 2 - num;
			const z = Math.random() * num * 2 - num;
			vertices.push(x, y, z);
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(vertices, 3),
		);
		return geometry;
	};

	private assignSRGB = (texture: THREE.Texture) => {
		texture.colorSpace = THREE.SRGBColorSpace;
	};

	private createMaterial = (
		filename: string,
		hslColor: { h: number; s: number; l: number },
		size: number,
	) => {
		const textureLoader = new THREE.TextureLoader();
		const sprite = textureLoader.load(filename, this.assignSRGB);
		const material = new THREE.PointsMaterial({
			size,
			map: sprite,
			blending: THREE.AdditiveBlending,
			depthTest: false,
			transparent: true,
		});

		material.color.setHSL(
			hslColor.h,
			hslColor.s,
			hslColor.l,
			THREE.SRGBColorSpace,
		);
		return material;
	};

	public configureBurst = (options: BurstOptions) => {
		const positions = this.geometry.getAttribute("position");
		if (!(positions instanceof THREE.BufferAttribute)) {
			return;
		}
		if (positions.count !== options.velocities.length) {
			console.warn("Particle burst velocity count mismatch");
			return;
		}
		const offsets = options.velocities.map(() => new THREE.Vector3());
		for (let i = 0; i < offsets.length; i++) {
			positions.setXYZ(i, 0, 0, 0);
		}
		positions.needsUpdate = true;
		const material = this.material as THREE.PointsMaterial;
		const startOpacity =
			options.startOpacity ?? (material.opacity ?? 1) ?? 1;
		material.opacity = startOpacity;
		this.burstState = {
			velocities: options.velocities,
			offsets,
			gravity: options.gravity?.clone() ?? new THREE.Vector3(0, -9.8, 0),
			duration: Math.max(0.01, options.duration),
			elapsed: 0,
			positions,
			startOpacity,
			endOpacity: options.endOpacity ?? 0,
		};
	};

	public update = (delta: number) => {
		if (!this.burstState) {
			this.rotation.y += delta;
			return;
		}
		const state = this.burstState;
		state.elapsed += delta;
		const positions = state.positions;
		for (let i = 0; i < state.velocities.length; i++) {
			state.velocities[i].addScaledVector(state.gravity, delta);
			state.offsets[i].addScaledVector(state.velocities[i], delta);
			positions.setXYZ(
				i,
				state.offsets[i].x,
				state.offsets[i].y,
				state.offsets[i].z,
			);
		}
		positions.needsUpdate = true;
		const material = this.material as THREE.PointsMaterial;
		const progress = THREE.MathUtils.clamp(
			state.elapsed / state.duration,
			0,
			1,
		);
		material.opacity = THREE.MathUtils.lerp(
			state.startOpacity,
			state.endOpacity,
			progress,
		);
	};

	public hasBurstFinished = () => {
		return Boolean(
			this.burstState && this.burstState.elapsed >= this.burstState.duration,
		);
	};

	public disposeResources = () => {
		this.geometry.dispose();
		(this.material as THREE.Material).dispose();
	};
}
