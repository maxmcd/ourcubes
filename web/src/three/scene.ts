import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { key, unpackKey } from "./voxels.js";

export class VoxelScene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private instancedMesh: THREE.InstancedMesh;
    private borderMesh: THREE.InstancedMesh;
    private voxelMap = new Map<number, string>();
    private dummy = new THREE.Object3D();
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private currentColor = "#ff0000";
    private onVoxelClick?: (k: number, color: string | null) => void;
    private onCursorMove?: (cursor: [number, number, number] | null) => void;
    private lastCursorSent: [number, number, number] | null = null;
    private highlightMesh: THREE.Mesh;
    private gridPlanes: THREE.Mesh[] = [];
    private otherPlayerCursors = new Map<string, THREE.Mesh>(); // playerId -> cursor mesh

    constructor(container: HTMLElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8f8f8);

        this.camera = new THREE.PerspectiveCamera(
            75,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(30, 30, 30);
        this.camera.lookAt(10, 10, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = false; // Disable shadows for softer look
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.4; // Much brighter exposure
        this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Better color reproduction
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(10, 10, 10);
        this.controls.update();

        // Create instanced mesh for voxels with soft toon material
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshToonMaterial({
            color: 0xffffff,
            transparent: false,
        });
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, 8000);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.count = 0; // Start with no instances
        this.instancedMesh.frustumCulled = false; // Prevent culling when inside the box
        this.instancedMesh.computeBoundingSphere(); // Ensure raycasting works
        this.scene.add(this.instancedMesh);

        // Create instanced mesh for voxel borders
        const borderGeometry = new THREE.BoxGeometry(1.02, 1.02, 1.02); // Slightly larger
        const borderMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.1,
        });
        this.borderMesh = new THREE.InstancedMesh(borderGeometry, borderMaterial, 8000);
        this.borderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.borderMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        this.borderMesh.count = 0;
        this.borderMesh.frustumCulled = false;
        this.borderMesh.computeBoundingSphere();
        this.scene.add(this.borderMesh);

        // Create highlight mesh using edges only
        const highlightEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05));
        const highlightMaterial = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.6,
        });
        this.highlightMesh = new THREE.LineSegments(highlightEdges, highlightMaterial);
        this.scene.add(this.highlightMesh);
        this.highlightMesh.visible = false;

        // Add bright, vivid lighting to make colors pop
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); // Very bright ambient light
        this.scene.add(ambientLight);

        // Multiple directional lights for even, vivid illumination
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight1.position.set(30, 40, 30);
        directionalLight1.castShadow = false;
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-30, 40, -30);
        directionalLight2.castShadow = false;
        this.scene.add(directionalLight2);

        // Add a subtle fill light from below for extra vibrancy
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(0, -20, 0);
        fillLight.castShadow = false;
        this.scene.add(fillLight);

        // Create invisible grid planes for picking at multiple Y levels
        this.createGridPlanes();

        // Create bounding box for drawing area
        this.createBoundingBox();

        this.setupEventListeners();
        this.updateInstancedMesh();
    }

    private createGridPlanes() {
        // Create invisible planes at each Y level for easier picking
        const planeGeometry = new THREE.PlaneGeometry(20, 20);
        const invisibleMaterial = new THREE.MeshBasicMaterial({
            visible: false,
            transparent: true,
            opacity: 0,
        });

        for (let y = 0; y < 20; y++) {
            const plane = new THREE.Mesh(planeGeometry, invisibleMaterial);
            plane.position.set(9.5, y, 9.5);
            plane.rotation.x = -Math.PI / 2;
            plane.userData = { isGridPlane: true, gridY: y };
            this.scene.add(plane);
            this.gridPlanes.push(plane);
        }
    }

    private createBoundingBox() {
        // Create edge-only bounding box using LineSegments
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(20, 20, 20));
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.4,
        });
        const boundingBox = new THREE.LineSegments(edges, lineMaterial);
        boundingBox.position.set(9.5, 9.5, 9.5); // Center the box
        this.scene.add(boundingBox);
    }

    private setupEventListeners() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener("mousemove", (event) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.updateHighlight();
        });

        canvas.addEventListener("mousedown", (event) => {
            this.handleMouseDown(event);
        });

        canvas.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });

        window.addEventListener("resize", () => {
            this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        });
    }

    private handleMouseDown(event: MouseEvent) {
        if (event.button === 0 || event.button === 2) {
            event.preventDefault();
            event.stopPropagation();

            if (event.button === 2 || (event.button === 0 && event.ctrlKey)) {
                this.handleVoxelRemoval();
            } else if (event.button === 0) {
                this.handleVoxelPlacement();
            }
        }
    }

    private handleVoxelRemoval() {
        const existingVoxelResult = this.getExistingVoxelAtMouse();
        if (existingVoxelResult !== null) {
            this.onVoxelClick?.(existingVoxelResult, null);
        }
    }

    private handleVoxelPlacement() {
        if (this.currentColor === "ERASER") {
            // When eraser is selected, act like removal
            this.handleVoxelRemoval();
        } else {
            const k = this.getVoxelAtMouse();
            if (k !== null) {
                this.onVoxelClick?.(k, this.currentColor);
            }
        }
    }

    private getVoxelAtMouse(): number | null {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for adjacent placement first
        const adjacentKey = this.getAdjacentVoxelPlacement();
        if (adjacentKey !== null) {
            return adjacentKey;
        }

        // Fall back to ground plane
        return this.getGroundPlacement();
    }

    private getAdjacentVoxelPlacement(): number | null {
        if (this.instancedMesh.count === 0) return null;

        const voxelIntersects = this.raycaster.intersectObject(this.instancedMesh, false);
        if (voxelIntersects.length === 0) return null;

        const intersect = voxelIntersects[0];
        const instanceId = intersect.instanceId;
        if (instanceId === undefined || !intersect.face) return null;

        const voxelPosition = this.getVoxelPosition(instanceId);
        if (!voxelPosition) return null;

        const normal = intersect.face.normal.clone();
        const newPos = voxelPosition.clone().add(normal);
        const coords = {
            x: Math.round(newPos.x),
            y: Math.round(newPos.y),
            z: Math.round(newPos.z),
        };

        return this.validateVoxelPlacement(coords);
    }

    private getVoxelPosition(instanceId: number): THREE.Vector3 | null {
        const matrix = new THREE.Matrix4();
        this.instancedMesh.getMatrixAt(instanceId, matrix);
        const position = new THREE.Vector3();
        matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
        return position;
    }

    private validateVoxelPlacement(coords: { x: number; y: number; z: number }): number | null {
        if (
            coords.x < 0 ||
            coords.x >= 20 ||
            coords.y < 0 ||
            coords.y >= 20 ||
            coords.z < 0 ||
            coords.z >= 20
        ) {
            return null;
        }

        const newKey = key(coords.x, coords.y, coords.z);
        if (this.voxelMap.has(newKey)) {
            return null;
        }

        return newKey;
    }

    private getGroundPlacement(): number | null {
        const groundPlaneIntersects = this.raycaster.intersectObject(this.gridPlanes[0]);
        if (groundPlaneIntersects.length === 0) return null;

        const point = groundPlaneIntersects[0].point;
        const x = Math.floor(Math.max(0, Math.min(19, point.x)));
        const z = Math.floor(Math.max(0, Math.min(19, point.z)));
        return key(x, 0, z);
    }

    private getExistingVoxelAtMouse(): number | null {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check if we're clicking directly on an existing voxel
        if (this.instancedMesh.count > 0) {
            const voxelIntersects = this.raycaster.intersectObject(this.instancedMesh, false);
            if (voxelIntersects.length > 0) {
                const intersect = voxelIntersects[0];
                const instanceId = intersect.instanceId;
                if (instanceId !== undefined) {
                    // Get the position of the clicked voxel
                    const matrix = new THREE.Matrix4();
                    this.instancedMesh.getMatrixAt(instanceId, matrix);
                    const position = new THREE.Vector3();
                    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());

                    const x = Math.round(position.x);
                    const y = Math.round(position.y);
                    const z = Math.round(position.z);

                    return key(x, y, z);
                }
            }
        }

        return null;
    }

    private updateHighlight() {
        const k = this.getVoxelAtMouse();
        if (k !== null) {
            const [x, y, z] = unpackKey(k);
            this.highlightMesh.position.set(x, y, z);
            this.highlightMesh.visible = true;

            // Send cursor position to other players (only if it changed)
            const newCursor: [number, number, number] = [x, y, z];
            if (
                !this.lastCursorSent ||
                this.lastCursorSent[0] !== newCursor[0] ||
                this.lastCursorSent[1] !== newCursor[1] ||
                this.lastCursorSent[2] !== newCursor[2]
            ) {
                this.lastCursorSent = newCursor;
                this.onCursorMove?.(newCursor);
            }
        } else {
            this.highlightMesh.visible = false;

            // Send null cursor (no hover) to other players (only if it changed)
            if (this.lastCursorSent !== null) {
                this.lastCursorSent = null;
                this.onCursorMove?.(null);
            }
        }
    }

    setCurrentColor(color: string) {
        this.currentColor = color;
    }

    setOnVoxelClick(callback: (k: number, color: string | null) => void) {
        this.onVoxelClick = callback;
    }

    setOnCursorMove(callback: (cursor: [number, number, number] | null) => void) {
        this.onCursorMove = callback;
    }

    updateVoxels(voxels: Map<number, string>) {
        this.voxelMap = new Map(voxels);
        this.updateInstancedMesh();
    }

    updatePlayerPresence(
        players: Array<{ playerId: string; cursor?: [number, number, number] }>,
        myPlayerId: string
    ) {
        // Remove cursors for players no longer present
        for (const [playerId, cursorMesh] of this.otherPlayerCursors.entries()) {
            const playerStillPresent = players.some(
                (p) => p.playerId === playerId && p.playerId !== myPlayerId
            );
            if (!playerStillPresent) {
                this.scene.remove(cursorMesh);
                this.otherPlayerCursors.delete(playerId);
            }
        }

        // Update or create cursors for other players
        for (const player of players) {
            if (player.playerId === myPlayerId || !player.cursor) continue; // Skip self and players without cursors

            let cursorMesh = this.otherPlayerCursors.get(player.playerId);
            if (!cursorMesh) {
                // Create new cursor mesh for this player
                const cursorGeometry = new THREE.EdgesGeometry(
                    new THREE.BoxGeometry(1.1, 1.1, 1.1)
                );
                const cursorMaterial = new THREE.LineBasicMaterial({
                    color: this.getPlayerColor(player.playerId),
                    transparent: true,
                    opacity: 0.8,
                });
                cursorMesh = new THREE.LineSegments(cursorGeometry, cursorMaterial);
                this.scene.add(cursorMesh);
                this.otherPlayerCursors.set(player.playerId, cursorMesh);
            }

            // Update cursor position
            const [x, y, z] = player.cursor;
            cursorMesh.position.set(x, y, z);
            cursorMesh.visible = true;
        }
    }

    private getPlayerColor(playerId: string): number {
        // Generate a consistent color based on playerId
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash = ((hash << 5) - hash + playerId.charCodeAt(i)) & 0xffffffff;
        }
        // Convert to a nice color range
        const hue = Math.abs(hash) % 360;
        return new THREE.Color().setHSL(hue / 360, 0.7, 0.5).getHex();
    }

    private updateInstancedMesh() {
        const voxelCount = this.voxelMap.size;
        this.instancedMesh.count = voxelCount;
        this.borderMesh.count = voxelCount;

        if (voxelCount === 0) {
            return;
        }

        let index = 0;
        for (const [k, colorHex] of this.voxelMap) {
            const [x, y, z] = unpackKey(k);

            // Set position for main voxel
            this.dummy.position.set(x, y, z);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
            this.borderMesh.setMatrixAt(index, this.dummy.matrix);

            // Use the exact color from the picker - no modifications
            const color = new THREE.Color(colorHex);
            this.instancedMesh.setColorAt(index, color);

            // Set border color (darker version of the main color)
            const borderColor = new THREE.Color(colorHex);
            const hsl = {};
            borderColor.getHSL(hsl);
            borderColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.2), Math.max(0, hsl.l * 0.7)); // Darker
            this.borderMesh.setColorAt(index, borderColor);

            index++;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.borderMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
        if (this.borderMesh.instanceColor) {
            this.borderMesh.instanceColor.needsUpdate = true;
        }

        // Update bounding spheres for raycasting
        this.instancedMesh.computeBoundingSphere();
        this.borderMesh.computeBoundingSphere();
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        const container = this.renderer.domElement.parentElement;
        if (container) {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        }
    }
}
