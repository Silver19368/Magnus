/**
 * Módulo de Simulación 3D para el Visualizador del Efecto Magnus
 * Configura y gestiona la escena 3D con Three.js
 */

class MagnusSimulation {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        // Parámetros de simulación
        this.physicsSolver = new MagnusPhysicsSolver();
        this.trajectoryPoints = [];
        this.idealTrajectoryPoints = [];
        this.currentFrame = 0;
        this.isPlaying = false;
        this.simulationSpeed = 1.0; // Multiplicador de velocidad (1x, 0.5x, 0.25x)
        this.lastTime = 0; // Seguimiento del tiempo real transcurrido para velocidad determinista de fotogramas
        
        // Elementos de la escena 3D
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Mallas de simulación
        this.ball = null;
        this.idealBallBall = null; // Balón fantasma para tiro sin efecto
        this.grass = null;
        this.goal = null;
        this.barrier = null;
        
        // Líneas de trayectoria
        this.magnusPathLine = null;
        this.idealPathLine = null;
        
        // Vectores de fuerza (ArrowHelpers)
        this.vectorArrows = {
            velocity: null,
            magnus: null,
            drag: null,
            gravity: null
        };
        
        // Propiedades de impacto y sacudida de cámara
        this.cameraShake = new THREE.Vector3(0, 0, 0);
        this.netDeformation = 0;
        this.lastCollisionType = null;

        // Dianas de precisión y partículas
        this.precisionTargets = [];
        this.targetsVisible = false;
        this.particleGroup = null;

        // Configuración de cámara actual
        this.activeCameraMode = 'kick'; // 'kick', 'gk', 'top', 'follow', 'orbit'
        
        // Inicialización
        this.init();
    }

    init() {
        // 1. Crear Escena y Neblina para profundidad
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0f1d);
        this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);

        // 2. Crear Cámara
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        
        // 3. Crear Renderizador
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // 4. Agregar Controles Orbitales
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.01; // No traspasar el suelo
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 80;

        // 5. Configurar Iluminación
        this.setupLights();

        // 6. Crear Entorno (Césped, Portería, Líneas de marcado)
        this.createPitch();
        this.createGoal();
        this.createBarrier();

        // 7. Crear Malla de los Balones
        this.createBalls();

        // 8. Crear Ayudantes de Vectores (Flechas 3D)
        this.createVectorArrows();

        // 8.5. Crear Grupo de Partículas y Dianas de Precisión
        this.particleGroup = new THREE.Group();
        this.scene.add(this.particleGroup);
        this.createPrecisionTargets();

        // 9. Establecer vista de cámara inicial
        this.setCameraMode('kick');

        // Manejar Resize de contenedor de forma responsiva mediante ResizeObserver
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
            this.resizeObserver.observe(this.container);
        } else {
            window.addEventListener('resize', () => this.onWindowResize());
        }

        // Iniciar bucle de animación
        this.animate();
    }

    setupLights() {
        // Luz ambiental suave
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambientLight);

        // Luz de luna / cielo nocturno azulada
        const hemisphereLight = new THREE.HemisphereLight(0x3b82f6, 0x05070f, 0.2);
        this.scene.add(hemisphereLight);

        // Reflector principal (Sol/Foco del Estadio) - Colocado alto detrás del chutador
        const spotLight = new THREE.SpotLight(0xffffff, 1.2);
        spotLight.position.set(0, 30, -10);
        spotLight.angle = Math.PI / 3;
        spotLight.penumbra = 0.8;
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 2048;
        spotLight.shadow.mapSize.height = 2048;
        spotLight.shadow.camera.near = 5;
        spotLight.shadow.camera.far = 80;
        spotLight.shadow.bias = -0.001;
        this.scene.add(spotLight);

        // Focos de la portería para iluminación dramática
        const goalLightL = new THREE.DirectionalLight(0x8b5cf6, 0.4); // Púrpura en la izquierda
        goalLightL.position.set(-15, 8, 35);
        this.scene.add(goalLightL);

        const goalLightR = new THREE.DirectionalLight(0x3b82f6, 0.4); // Azul en la derecha
        goalLightR.position.set(15, 8, 35);
        this.scene.add(goalLightR);
    }

    createPitch() {
        // 1. Plano del césped
        // Dimensiones del césped: Ancho 60m, Largo 80m. Centrado.
        const pitchGeo = new THREE.PlaneGeometry(70, 90);
        
        // Crear textura de césped con franjas procedimentales mediante Canvas
        const grassCanvas = document.createElement('canvas');
        grassCanvas.width = 256;
        grassCanvas.height = 512;
        const ctx = grassCanvas.getContext('2d');
        
        // Dibujar franjas alternadas
        const numStripes = 16;
        const stripeHeight = grassCanvas.height / numStripes;
        for (let i = 0; i < numStripes; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#143818' : '#0f2b12'; // Dos tonalidades de verde oscuro premium
            ctx.fillRect(0, i * stripeHeight, grassCanvas.width, stripeHeight);
            
            // Añadir textura fina de hierba
            ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
            for (let j = 0; j < 1000; j++) {
                const rx = Math.random() * grassCanvas.width;
                const ry = (Math.random() * stripeHeight) + (i * stripeHeight);
                ctx.fillRect(rx, ry, 1.5, 3 + Math.random() * 4);
            }
        }
        
        const grassTex = new THREE.CanvasTexture(grassCanvas);
        grassTex.wrapS = THREE.RepeatWrapping;
        grassTex.wrapT = THREE.RepeatWrapping;
        grassTex.repeat.set(1, 1);

        const grassMat = new THREE.MeshStandardMaterial({
            map: grassTex,
            roughness: 0.95,
            metalness: 0.05
        });

        this.grass = new THREE.Mesh(pitchGeo, grassMat);
        this.grass.rotation.x = -Math.PI / 2;
        this.grass.position.set(0, 0, 15); // Centrado en el eje Z de vuelo
        this.grass.receiveShadow = true;
        this.scene.add(this.grass);

        // 2. Líneas de marcado (Pintadas ligeramente sobre el césped para evitar Z-fighting)
        this.createMarkings();
    }

    createMarkings() {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
        const thickness = 0.08; // Grosor de las líneas 8cm
        const zOffset = 0.005; // Altura mínima sobre el césped

        // Línea de Meta (a Z = 35m)
        const goalLineGeo = new THREE.PlaneGeometry(60, thickness);
        const goalLine = new THREE.Mesh(goalLineGeo, material);
        goalLine.rotation.x = -Math.PI / 2;
        goalLine.position.set(0, zOffset, 35);
        this.scene.add(goalLine);

        // Área Grande (Penalty Area): 16.5m x 40.3m. Centrada en Z = 35m.
        // Se extiende hacia atrás hasta Z = 35 - 16.5 = 18.5m
        const areaLines = [
            // Línea delantera (Z = 18.5m, de X = -20.15 a 20.15)
            { w: 40.3, h: thickness, px: 0, pz: 18.5, rot: 0 },
            // Lateral izquierdo (de Z = 18.5 a 35, en X = -20.15)
            { w: thickness, h: 16.5, px: -20.15, pz: 26.75, rot: 0 },
            // Lateral derecho (de Z = 18.5 a 35, en X = 20.15)
            { w: thickness, h: 16.5, px: 20.15, pz: 26.75, rot: 0 }
        ];

        areaLines.forEach(line => {
            const geo = new THREE.PlaneGeometry(line.w, line.h);
            const mesh = new THREE.Mesh(geo, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(line.px, zOffset, line.pz);
            this.scene.add(mesh);
        });

        // Área Chica (Goal Area): 5.5m x 18.32m. Centrada en Z = 35m.
        // Se extiende hasta Z = 35 - 5.5 = 29.5m
        const smallAreaLines = [
            { w: 18.32, h: thickness, px: 0, pz: 29.5 },
            { w: thickness, h: 5.5, px: -9.16, pz: 32.25 },
            { w: thickness, h: 5.5, px: 9.16, pz: 32.25 }
        ];

        smallAreaLines.forEach(line => {
            const geo = new THREE.PlaneGeometry(line.w, line.h);
            const mesh = new THREE.Mesh(geo, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(line.px, zOffset, line.pz);
            this.scene.add(mesh);
        });

        // Punto Penal (a Z = 35 - 11 = 24m)
        const spotGeo = new THREE.CircleGeometry(0.12, 16);
        const spot = new THREE.Mesh(spotGeo, material);
        spot.rotation.x = -Math.PI / 2;
        spot.position.set(0, zOffset, 24);
        this.scene.add(spot);

        // Arco de área grande (Semicírculo de radio 9.15m desde el punto penal en Z = 24)
        // El arco sobresale del área grande (Z < 18.5)
        const arcGeo = new THREE.RingGeometry(9.10, 9.18, 30, 1, Math.PI + 0.65, Math.PI - 1.3);
        const arc = new THREE.Mesh(arcGeo, material);
        arc.rotation.x = -Math.PI / 2;
        arc.position.set(0, zOffset, 24);
        this.scene.add(arc);
    }

    createGoal() {
        const postRadius = 0.06; // Poste de 12cm de diámetro
        const goalWidth = 7.32;
        const goalHeight = 2.44;
        const goalDepth = 1.8;
        const goalZ = 35; // Ubicación sobre el eje Z
        
        this.goal = new THREE.Group();

        // Material metálico blanco para los postes
        const postMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.25,
            metalness: 0.6
        });

        // 1. Crear los 2 Postes Verticales
        const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 32);
        
        const postLeft = new THREE.Mesh(postGeo, postMat);
        postLeft.position.set(-goalWidth / 2, goalHeight / 2, goalZ);
        postLeft.castShadow = true;
        this.goal.add(postLeft);

        const postRight = new THREE.Mesh(postGeo, postMat);
        postRight.position.set(goalWidth / 2, goalHeight / 2, goalZ);
        postRight.castShadow = true;
        this.goal.add(postRight);

        // 2. Crear el Travesaño Horizontal
        const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth + postRadius, 32);
        const crossbar = new THREE.Mesh(crossbarGeo, postMat);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, goalHeight, goalZ);
        crossbar.castShadow = true;
        this.goal.add(crossbar);

        // 3. Postes de soporte traseros en el suelo (negros/grises)
        const supportMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
        const supportGeo = new THREE.CylinderGeometry(0.04, 0.04, goalDepth, 16);
        
        const supLeft = new THREE.Mesh(supportGeo, supportMat);
        supLeft.rotation.x = Math.PI / 2;
        supLeft.position.set(-goalWidth / 2, 0.02, goalZ + goalDepth / 2);
        this.goal.add(supLeft);

        const supRight = new THREE.Mesh(supportGeo, supportMat);
        supRight.rotation.x = Math.PI / 2;
        supRight.position.set(goalWidth / 2, 0.02, goalZ + goalDepth / 2);
        this.goal.add(supRight);

        const supBack = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, goalWidth, 16), supportMat);
        supBack.rotation.z = Math.PI / 2;
        supBack.position.set(0, 0.02, goalZ + goalDepth);
        this.goal.add(supBack);

        // Tensores oblicuos traseros
        const diagonalLength = Math.sqrt(goalHeight*goalHeight + goalDepth*goalDepth);
        const diagGeo = new THREE.CylinderGeometry(0.03, 0.03, diagonalLength, 16);
        
        const diagLeft = new THREE.Mesh(diagGeo, supportMat);
        diagLeft.rotation.x = Math.atan2(goalDepth, goalHeight);
        diagLeft.position.set(-goalWidth / 2, goalHeight / 2, goalZ + goalDepth / 2);
        this.goal.add(diagLeft);

        const diagRight = new THREE.Mesh(diagGeo, supportMat);
        diagRight.rotation.x = Math.atan2(goalDepth, goalHeight);
        diagRight.position.set(goalWidth / 2, goalHeight / 2, goalZ + goalDepth / 2);
        this.goal.add(diagRight);

        // 4. Crear la Red
        // La modelamos con un material de malla semi-transparente para un rendimiento óptimo
        const netCanvas = document.createElement('canvas');
        netCanvas.width = 64;
        netCanvas.height = 64;
        const netCtx = netCanvas.getContext('2d');
        netCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        netCtx.lineWidth = 2;
        
        // Patrón de cuadrícula para la red
        netCtx.beginPath();
        netCtx.rect(0, 0, 64, 64);
        netCtx.moveTo(0, 16); netCtx.lineTo(64, 16);
        netCtx.moveTo(0, 32); netCtx.lineTo(64, 32);
        netCtx.moveTo(0, 48); netCtx.lineTo(64, 48);
        netCtx.moveTo(16, 0); netCtx.lineTo(16, 64);
        netCtx.moveTo(32, 0); netCtx.lineTo(32, 64);
        netCtx.moveTo(48, 0); netCtx.lineTo(48, 64);
        netCtx.stroke();
        
        const netTex = new THREE.CanvasTexture(netCanvas);
        netTex.wrapS = THREE.RepeatWrapping;
        netTex.wrapT = THREE.RepeatWrapping;
        netTex.repeat.set(15, 6);

        const netMat = new THREE.MeshBasicMaterial({
            map: netTex,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        // Forma de la red (3 planos: techo, pared trasera, y dos paredes triangulares laterales)
        // Red Trasera
        const netBackGeo = new THREE.PlaneGeometry(goalWidth, goalHeight);
        const netBack = new THREE.Mesh(netBackGeo, netMat);
        netBack.position.set(0, goalHeight / 2, goalZ + goalDepth);
        this.goal.add(netBack);
        this.netBack = netBack; // Guardar referencia

        // Techo de la Red
        const netTopGeo = new THREE.PlaneGeometry(goalWidth, goalDepth);
        const netTop = new THREE.Mesh(netTopGeo, netMat);
        netTop.rotation.x = Math.PI / 2;
        netTop.position.set(0, goalHeight, goalZ + goalDepth / 2);
        this.goal.add(netTop);
        this.netTop = netTop; // Guardar referencia

        // Laterales Triangulares
        const createTriangleNet = (xPos) => {
            const geom = new THREE.BufferGeometry();
            const vertices = new Float32Array([
                xPos, 0, goalZ,            // Frente abajo
                xPos, goalHeight, goalZ,   // Frente arriba
                xPos, goalHeight, goalZ + goalDepth, // Atrás arriba
                
                xPos, 0, goalZ,            // Frente abajo
                xPos, goalHeight, goalZ + goalDepth, // Atrás arriba
                xPos, 0, goalZ + goalDepth // Atrás abajo
            ]);
            
            // Mapeo UV simplificado para la textura de red lateral
            const uvs = new Float32Array([
                0, 0,
                0, 1,
                1, 1,
                
                0, 0,
                1, 1,
                1, 0
            ]);

            geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geom.computeVertexNormals();

            const netSideMat = new THREE.MeshBasicMaterial({
                map: netTex,
                transparent: true,
                opacity: 0.65,
                side: THREE.DoubleSide
            });
            return new THREE.Mesh(geom, netSideMat);
        };

        this.goal.add(createTriangleNet(-goalWidth / 2));
        this.goal.add(createTriangleNet(goalWidth / 2));

        this.scene.add(this.goal);
    }

    createBarrier(numPlayers = 4) {
        if (!this.barrier) {
            this.barrier = new THREE.Group();
            this.scene.add(this.barrier);
        } else {
            // Limpiar barrera existente
            while(this.barrier.children.length > 0){ 
                this.barrier.remove(this.barrier.children[0]); 
            }
        }
        
        // Posición de la barrera: por reglamento a 9.15m del balón.
        const playerWidth = 0.5;
        const spacing = 0.55;
        const barrierZ = 9.15;
        const startX = 0.6; // Desplazados a la derecha del centro para forzar el tiro con curva

        // Materiales premium para la barrera (Estilo holograma o maniquí deportivo)
        // Usamos un color oscuro semi-metálico con bordes brillantes
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.4,
            metalness: 0.8,
            emissive: 0x3b82f6,
            emissiveIntensity: 0.15
        });

        const jerseyMat = new THREE.MeshStandardMaterial({
            color: 0xef4444, // Camisetas rojas para contrastar
            roughness: 0.6,
            metalness: 0.1
        });

        const headMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            roughness: 0.8
        });

        for (let i = 0; i < numPlayers; i++) {
            const player = new THREE.Group();
            const px = startX + (i * spacing);
            
            // Altura promedio de jugador: 1.80m
            // 1. Cabeza (Esfera)
            const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.set(0, 1.70, 0);
            head.castShadow = true;
            player.add(head);

            // 2. Torso (Cilindro con jersey)
            const torsoGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.70, 16);
            const torso = new THREE.Mesh(torsoGeo, jerseyMat);
            torso.position.set(0, 1.25, 0);
            torso.castShadow = true;
            player.add(torso);

            // 3. Piernas (Cilindros paralelos)
            const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.90, 16);
            
            const legL = new THREE.Mesh(legGeo, bodyMat);
            legL.position.set(-0.09, 0.45, 0);
            legL.castShadow = true;
            player.add(legL);
            
            const legR = new THREE.Mesh(legGeo, bodyMat);
            legR.position.set(0.09, 0.45, 0);
            legR.castShadow = true;
            player.add(legR);

            // 4. Brazos en pose clásica tapando barrera (Cruzados cubriendo pelvis)
            const armGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.50, 16);
            
            const armL = new THREE.Mesh(armGeo, bodyMat);
            armL.rotation.z = Math.PI / 4;
            armL.rotation.x = -Math.PI / 6;
            armL.position.set(-0.2, 1.15, 0.1);
            armL.castShadow = true;
            player.add(armL);

            const armR = new THREE.Mesh(armGeo, bodyMat);
            armR.rotation.z = -Math.PI / 4;
            armR.rotation.x = -Math.PI / 6;
            armR.position.set(0.2, 1.15, 0.1);
            armR.castShadow = true;
            player.add(armR);

            player.position.set(px, 0, barrierZ);
            
            // Guardamos la altura base para posibles animaciones de salto
            player.userData = { baseY: 0, px: px, pz: barrierZ };

            this.barrier.add(player);
        }
    }



    createBalls() {
        // Diámetro oficial: 22cm (Radio: 11cm = 0.11 unidades de Three.js)
        const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);

        // Generar textura procedural moderna y de alta fidelidad
        const ballTex = this.generateSoccerBallTexture();

        const ballMat = new THREE.MeshStandardMaterial({
            map: ballTex,
            roughness: 0.15,
            metalness: 0.1,
            bumpMap: ballTex, // La misma textura sirve de mapa de rugosidad/relieve suave
            bumpScale: 0.005
        });

        // 1. Balón de Simulación Principal (Fuerzas + Magnus)
        this.ball = new THREE.Mesh(ballGeo, ballMat);
        this.ball.position.set(0, BALL_RADIUS, 0);
        this.ball.castShadow = true;
        this.ball.receiveShadow = true;
        this.scene.add(this.ball);

        // 2. Balón de Referencia Ideal (Sin Efecto Magnus - Fantasma semi-transparente)
        const idealMat = new THREE.MeshBasicMaterial({
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.35,
            wireframe: false
        });
        this.idealBall = new THREE.Mesh(ballGeo, idealMat);
        this.idealBall.position.set(0, BALL_RADIUS, 0);
        this.scene.add(this.idealBall);
    }

    generateSoccerBallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Fondo de cuero blanco premium
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Textura fina de cuero mediante micro-ruido
        ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
        for (let i = 0; i < 40000; i++) {
            const rx = Math.random() * canvas.width;
            const ry = Math.random() * canvas.height;
            ctx.fillRect(rx, ry, 1, 1);
        }

        // Diseño Geométrico Premium (Azul eléctrico y detalles dorados tipo Copa del Mundo)
        const numPanels = 10;
        const panelWidth = canvas.width / numPanels;

        // Dibujar franjas curvas modernas
        for (let i = 0; i < numPanels; i++) {
            const cx = (i + 0.5) * panelWidth;
            
            // Franjas azules
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.arc(cx, 256, 120, 0, Math.PI * 2);
            ctx.stroke();

            // Franjas celestes finas paralelas
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, 256, 134, 0, Math.PI * 2);
            ctx.stroke();

            // Costuras/detalles dorados
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, 256, 110, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Dibujar Pentágonos negros del balón clásico para facilidad visual de rotación
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;

        const drawPent = (x, y, r, rot = 0) => {
            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
                const angle = (j * 2 * Math.PI / 5) - Math.PI / 2 + rot;
                const px = x + Math.cos(angle) * r;
                const py = y + Math.sin(angle) * r;
                if (j === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };

        // Posiciones estratégicas de pentágonos en el mapa UV (1024x512) para que se distribuyan bien en la esfera
        const pents = [
            // Fila superior (Latitud alta)
            { x: 102, y: 120, r: 35, rot: 0.2 },
            { x: 307, y: 120, r: 35, rot: -0.4 },
            { x: 512, y: 120, r: 35, rot: 0.8 },
            { x: 717, y: 120, r: 35, rot: 0.1 },
            { x: 922, y: 120, r: 35, rot: -0.9 },
            // Fila inferior (Latitud baja)
            { x: 102, y: 392, r: 35, rot: 0.5 },
            { x: 307, y: 392, r: 35, rot: -0.2 },
            { x: 512, y: 392, r: 35, rot: 0.9 },
            { x: 717, y: 392, r: 35, rot: 0.3 },
            { x: 922, y: 392, r: 35, rot: -0.6 }
        ];

        pents.forEach(p => drawPent(p.x, p.y, p.r, p.rot));

        // Dibujar costuras/líneas del balón (secciones hexagonales que conectan pentágonos)
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        // Líneas horizontales de costura onduladas
        ctx.beginPath();
        for (let y = 64; y < canvas.height; y += 128) {
            ctx.moveTo(0, y);
            for (let x = 0; x <= canvas.width; x += 32) {
                ctx.lineTo(x, y + Math.sin(x / 40) * 15);
            }
        }
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4; // Mayor nitidez en ángulos oblicuos
        return texture;
    }

    createVectorArrows() {
        const ballPos = this.ball.position;
        
        // Escala del vector de fuerza: 1 Newton = 0.4 metros de flecha
        // La gravedad del balón es de 4.2N (flecha de ~1.7m de longitud constante)
        const scale = 0.4; 

        // Vector 1: Velocidad (Azul Eléctrico)
        this.vectorArrows.velocity = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            ballPos,
            1.5,
            0x3b82f6,
            0.25,
            0.12
        );
        
        // Vector 2: Magnus Force (Oro Vibrante)
        this.vectorArrows.magnus = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            ballPos,
            0,
            0xf59e0b,
            0.25,
            0.12
        );
        
        // Vector 3: Drag Force (Rojo Coral)
        this.vectorArrows.drag = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, -1),
            ballPos,
            0,
            0xef4444,
            0.25,
            0.12
        );
        
        // Vector 4: Gravedad (Púrpura Neon)
        this.vectorArrows.gravity = new THREE.ArrowHelper(
            new THREE.Vector3(0, -1, 0),
            ballPos,
            (BALL_MASS * G_ACCEL) * scale,
            0x8b5cf6,
            0.25,
            0.12
        );

        // Agregarlos a la escena
        Object.values(this.vectorArrows).forEach(arrow => {
            arrow.line.material.linewidth = 3; // Hacer flechas más gruesas y visibles
            this.scene.add(arrow);
        });
    }

    setCameraMode(mode, forceReset = true) {
        const previousMode = this.activeCameraMode;
        this.activeCameraMode = mode;
        this.controls.enabled = true; // Habilitado por defecto para interacción libre posterior

        // Reposicionamos si cambia de modo, si se fuerza el reset, o si no es la cámara orbital (las demás cámaras siguen al balón dinámico)
        if (previousMode !== mode || forceReset || mode !== 'orbit') {
            const bp = this.ball ? this.ball.position : new THREE.Vector3(0, 0.11, 0);
            switch (mode) {
                case 'tv':
                    // Cámara Broadcast TV: Zoom extremo, desde las gradas diagonales para aplanar la profundidad y exagerar la curva
                    const sX = this.trajectoryPoints.length > 0 ? this.trajectoryPoints[0].pos.x : 0;
                    const sZ = this.trajectoryPoints.length > 0 ? this.trajectoryPoints[0].pos.z : 0;
                    
                    // Colocar la cámara en el lado opuesto al de donde se patea para ver el efecto curvar hacia la cámara
                    const camX = sX > 2 ? -25 : (sX < -2 ? 25 : (sX > 0 ? -20 : 20));
                    this.camera.position.set(camX, 10.0, sZ - 15);
                    this.camera.fov = 18; // Mucho zoom
                    this.camera.updateProjectionMatrix();
                    this.controls.target.copy(bp);
                    break;
                case 'kick':
                    // Detrás del balón, mirando directamente hacia la portería (0, 1.0, 35.0)
                    const goalPos = new THREE.Vector3(0, 1.0, 35.0);
                    const kickDir = new THREE.Vector3().subVectors(bp, goalPos);
                    kickDir.y = 0; // mantener nivelado en plano horizontal
                    kickDir.normalize();
                    // Colocar la cámara 4.5m detrás del balón y 1.7m arriba
                    this.camera.position.copy(bp).addScaledVector(kickDir, 4.5);
                    this.camera.position.y = bp.y + 1.7;
                    this.controls.target.copy(goalPos);
                    break;
                case 'gk':
                    // Desde la portería, mirando de frente al balón
                    this.camera.position.set(0, 1.5, 36.5);
                    this.controls.target.copy(bp);
                    break;
                case 'top':
                    // Vista aérea cenital centrada dinámicamente en el recorrido del tiro
                    const midZ = (bp.z + 35.0) / 2;
                    const midX = bp.x / 2;
                    this.camera.position.set(midX, 36, midZ);
                    this.controls.target.set(midX, 0.1, midZ);
                    break;
                case 'follow':
                    // Sigue al balón de cerca
                    this.camera.position.set(bp.x - 3.5, bp.y + 1.8, bp.z - 4.5);
                    this.controls.target.copy(bp);
                    break;
                case 'orbit':
                    // Vista orbital libre por defecto
                    if (forceReset || previousMode !== mode) {
                        this.camera.position.set(-15, 12, 10);
                        this.controls.target.set(0, 1.5, 15);
                    }
                    break;
            }
            this.controls.update();
        }
        
        if (mode !== 'tv' && this.camera.fov !== 45) {
            this.camera.fov = 45;
            this.camera.updateProjectionMatrix();
        }

        // Actualizar UI de botones de cámara activa (excluyendo el botón del drawer)
        document.querySelectorAll('.cam-controls .btn-cam').forEach(btn => {
            if (btn.id !== 'presets-tab-trigger') {
                btn.classList.remove('active');
            }
        });
        const activeBtn = document.getElementById(`cam-${mode}`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    /**
     * Calcula las trayectorias con los parámetros del panel de control
     */
    runPhysicsCalculation(shootParams) {
        // Inyectar densidad del aire dinámica calculada a partir de la altitud
        if (shootParams.airDensity !== undefined) {
            this.physicsSolver.rho = shootParams.airDensity;
        }

        // Guardamos los parámetros actuales para que otras funciones (como el salto) puedan consultarlos
        this.currentShootParams = shootParams;

        // Posicionar dinámicamente la barrera en la escena 3D según el origen del tiro
        const startX = shootParams.initialPos ? shootParams.initialPos.x : 0;
        const startZ = shootParams.initialPos ? shootParams.initialPos.z : 0;
        const barrierZ = startZ + 9.15;
        const barrierXOffset = shootParams.barrierXOffset !== undefined ? shootParams.barrierXOffset : 0.6;
        const spacing = 0.55;
        const numPlayers = shootParams.barrierPlayers !== undefined ? shootParams.barrierPlayers : 4;

        // Asegurarnos de que el número de jugadores sea el correcto
        if (!this.barrier || this.barrier.children.length !== numPlayers) {
            this.createBarrier(numPlayers);
        }

        if (this.barrier) {
            this.barrier.children.forEach((player, i) => {
                const px = startX + barrierXOffset + i * spacing;
                player.position.set(px, 0, barrierZ);
                player.userData.px = px;
                player.userData.pz = barrierZ;
                player.userData.baseY = 0;
            });
        }

        // Trayectoria con efecto Magnus
        this.trajectoryPoints = this.physicsSolver.calculateTrajectory(shootParams, true);
        // Trayectoria ideal de referencia sin Magnus
        this.idealTrajectoryPoints = this.physicsSolver.calculateTrajectory(shootParams, false);
        
        // Generar las líneas de trazado 3D en la escena
        this.drawTrajectoryLines();
        
        // Reiniciar animación al inicio de la trayectoria calculada sin reiniciar la cámara
        this.resetSimulation(true);
    }

    drawTrajectoryLines() {
        // Remover líneas anteriores si existen
        if (this.magnusPathLine) this.scene.remove(this.magnusPathLine);
        if (this.idealPathLine) this.scene.remove(this.idealPathLine);

        // 1. Línea Magnus (Línea Dorada Sólida con Brillo)
        const magnusPoints = this.trajectoryPoints.map(p => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z));
        const magnusGeo = new THREE.BufferGeometry().setFromPoints(magnusPoints);
        const magnusMat = new THREE.LineBasicMaterial({
            color: 0xf59e0b,
            linewidth: 3 // Nota: en WebGL nativo de Chrome/Windows, linewidth suele limitarse a 1, pero se define por compatibilidad
        });
        this.magnusPathLine = new THREE.Line(magnusGeo, magnusMat);
        this.scene.add(this.magnusPathLine);

        // 2. Línea Ideal Sin Magnus (Línea Discontinua Blanca)
        const idealPoints = this.idealTrajectoryPoints.map(p => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z));
        const idealGeo = new THREE.BufferGeometry().setFromPoints(idealPoints);
        
        // Para hacer línea discontinua en Three.js se usa LineDashedMaterial y computeLineDistances
        const idealMat = new THREE.LineDashedMaterial({
            color: 0x94a3b8,
            dashSize: 0.6,
            gapSize: 0.4,
            transparent: true,
            opacity: 0.6
        });
        this.idealPathLine = new THREE.Line(idealGeo, idealMat);
        this.idealPathLine.computeLineDistances();
        
        // Ocultar o mostrar según UI
        const showIdeal = document.getElementById('toggle-ideal').checked;
        this.idealPathLine.visible = showIdeal;
        this.idealBall.visible = showIdeal;
        
        this.scene.add(this.idealPathLine);
    }

    resetSimulation(preventCameraReset = false) {
        this.currentFrame = 0;
        this.isPlaying = false;
        this.lastTime = 0; // Reiniciar seguimiento de tiempo delta
        
        // Posicionar balones en inicio
        if (this.trajectoryPoints.length > 0) {
            const start = this.trajectoryPoints[0];
            this.ball.position.set(start.pos.x, start.pos.y, start.pos.z);
            this.ball.quaternion.set(0, 0, 0, 1); // Reset rotación
            
            const startIdeal = this.idealTrajectoryPoints[0];
            this.idealBall.position.set(startIdeal.pos.x, startIdeal.pos.y, startIdeal.pos.z);
            
            this.updateTelemetryAndVectors(start);
        }
        
        // Reiniciar animaciones de la barrera (bajar del salto)
        this.barrier.children.forEach(player => {
            player.position.y = player.userData.baseY;
        });

        // Actualizar controles de UI externos
        document.getElementById('btn-play-pause').disabled = false;
        document.getElementById('btn-play-pause').innerHTML = '<i data-lucide="play"></i>';
        replaceLucideIcons();
        
        if (!preventCameraReset || this.activeCameraMode !== 'orbit') {
            this.setCameraMode(this.activeCameraMode, !preventCameraReset);
        }
    }

    startSimulation() {
        if (this.trajectoryPoints.length === 0) return;
        this.isPlaying = true;
        this.lastTime = performance.now(); // Capturar instante de inicio
        document.getElementById('btn-play-pause').innerHTML = '<i data-lucide="pause"></i>';
        replaceLucideIcons();
    }

    pauseSimulation() {
        this.isPlaying = false;
        this.lastTime = 0; // Detener seguimiento
        document.getElementById('btn-play-pause').innerHTML = '<i data-lucide="play"></i>';
        replaceLucideIcons();
    }

    updateTelemetryAndVectors(point) {
        // 1. Actualizar texto de telemetría superior izquierdo
        // Calcular distancia 3D recorrida desde el punto inicial del tiro
        const startPt = this.trajectoryPoints[0];
        const dist = startPt ? Math.sqrt(
            (point.pos.x - startPt.pos.x)**2 + 
            (point.pos.y - startPt.pos.y)**2 + 
            (point.pos.z - startPt.pos.z)**2
        ) : 0;
        const elDist = document.getElementById('telemetry-distance');
        const elHeight = document.getElementById('telemetry-height');
        const elSpeed = document.getElementById('telemetry-speed');
        
        elDist.textContent = `${dist.toFixed(1)} m`;
        elHeight.textContent = `${point.pos.y.toFixed(1)} m`;
        elSpeed.textContent = `${point.speedKmh.toFixed(1)} km/h`;
        
        // Efecto visual "Live Glow" durante el vuelo
        if (this.isPlaying) {
            elDist.classList.add('live-glow');
            elHeight.classList.add('live-glow');
            elSpeed.classList.add('live-glow');
        } else {
            elDist.classList.remove('live-glow');
            elHeight.classList.remove('live-glow');
            elSpeed.classList.remove('live-glow');
        }
        
        // Magnitud de las fuerzas
        const fmMag = Math.sqrt(point.forces.magnus.x**2 + point.forces.magnus.y**2 + point.forces.magnus.z**2);
        const fdMag = Math.sqrt(point.forces.drag.x**2 + point.forces.drag.y**2 + point.forces.drag.z**2);
        const fgMag = BALL_MASS * G_ACCEL;
        
        document.getElementById('force-magnus-val').textContent = fmMag.toFixed(2);
        document.getElementById('force-drag-val').textContent = fdMag.toFixed(2);
        
        // 2. Actualizar vectores 3D (ArrowHelpers)
        const showVectors = document.getElementById('toggle-vectors').checked;
        
        if (!showVectors) {
            Object.values(this.vectorArrows).forEach(arrow => arrow.visible = false);
            return;
        }

        const ballPos = this.ball.position;
        const scale = 0.45; // Escala de visualización: 1 Newton = 0.45 metros
        
        // Vector Velocidad (Blue): apunta en la dirección de la velocidad instantánea
        const velVec = new THREE.Vector3(point.vel.x, point.vel.y, point.vel.z);
        const speed = velVec.length();
        this.vectorArrows.velocity.visible = true;
        this.vectorArrows.velocity.position.copy(ballPos);
        if (speed > 0.1) {
            this.vectorArrows.velocity.setDirection(velVec.clone().normalize());
            this.vectorArrows.velocity.setLength(Math.min(3.5, speed * 0.08), 0.2, 0.1);
        } else {
            this.vectorArrows.velocity.visible = false;
        }

        // Vector Magnus (Gold): apunta en dirección de la fuerza de Magnus
        const fmVec = new THREE.Vector3(point.forces.magnus.x, point.forces.magnus.y, point.forces.magnus.z);
        if (fmMag > 0.05) {
            this.vectorArrows.magnus.visible = true;
            this.vectorArrows.magnus.position.copy(ballPos);
            this.vectorArrows.magnus.setDirection(fmVec.clone().normalize());
            this.vectorArrows.magnus.setLength(fmMag * scale, 0.2, 0.1);
        } else {
            this.vectorArrows.magnus.visible = false;
        }

        // Vector Arrastre (Red): apunta opuesto a la velocidad
        const fdVec = new THREE.Vector3(point.forces.drag.x, point.forces.drag.y, point.forces.drag.z);
        if (fdMag > 0.05) {
            this.vectorArrows.drag.visible = true;
            this.vectorArrows.drag.position.copy(ballPos);
            this.vectorArrows.drag.setDirection(fdVec.clone().normalize());
            this.vectorArrows.drag.setLength(fdMag * scale, 0.2, 0.1);
        } else {
            this.vectorArrows.drag.visible = false;
        }

        // Vector Gravedad (Purple): apunta siempre hacia abajo
        this.vectorArrows.gravity.visible = true;
        this.vectorArrows.gravity.position.copy(ballPos);
        this.vectorArrows.gravity.setLength(fgMag * scale, 0.2, 0.1);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Actualizar controles orbitales
        this.controls.update();

        // Obtener delta tiempo real transcurrido
        const now = performance.now();
        if (!this.lastTime || this.lastTime === 0) {
            this.lastTime = now;
        }
        const deltaMs = now - this.lastTime;
        this.lastTime = now;

        // Lógica de avance de simulación
        if (this.isPlaying && this.trajectoryPoints.length > 0) {
            // Cada paso físico dt en physics.js es 1/120 segundos.
            // Para reproducir a velocidad 1.0 real, debemos avanzar 120 pasos físicos por segundo real.
            // deltaSeconds = deltaMs / 1000.
            // Pasos a avanzar = deltaSeconds * 120 * simulationSpeed.
            // Limitamos deltaMs a un máximo de 100ms para evitar saltos bruscos en caídas de fps o desenfoques de pestaña.
            const deltaSeconds = Math.min(0.1, deltaMs / 1000);
            const stepDelta = deltaSeconds * 120 * this.simulationSpeed;
            this.currentFrame += stepDelta;
            
            let frameIdx = Math.floor(this.currentFrame);
            
            // Si llega al final del vuelo
            if (frameIdx >= this.trajectoryPoints.length - 1) {
                frameIdx = this.trajectoryPoints.length - 1;
                this.currentFrame = frameIdx;
                this.isPlaying = false;
                document.getElementById('btn-play-pause').innerHTML = '<i data-lucide="play"></i>';
                replaceLucideIcons();
                
                // Animación de impacto final:
                // Si entra en la portería en el plano Z = 35m
                this.checkGoalTrigger();
            }

            const p = this.trajectoryPoints[frameIdx];
            const pIdeal = this.idealTrajectoryPoints[Math.min(frameIdx, this.idealTrajectoryPoints.length - 1)];

            // Actualizar posiciones físicas en escena
            this.ball.position.set(p.pos.x, p.pos.y, p.pos.z);
            this.idealBall.position.set(pIdeal.pos.x, pIdeal.pos.y, pIdeal.pos.z);



            // Calcular y aplicar la rotación del balón en 3D (Quaternions para evitar gimbal lock)
            // Rotación delta = omega * dt.
            const dt = (1 / 120) * stepDelta;
            const spinVec = new THREE.Vector3(p.spin.x, p.spin.y, p.spin.z);
            const spinSpeed = spinVec.length(); // rad/s
            
            if (spinSpeed > 0.01) {
                const rotationAxis = spinVec.clone().normalize();
                const deltaAngle = spinSpeed * dt;
                const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
                this.ball.quaternion.multiplyQuaternions(deltaQuat, this.ball.quaternion);
            }

            // Ocultar/Mostrar visibilidad de balón ideal según UI
            const showIdeal = document.getElementById('toggle-ideal').checked;
            this.idealBall.visible = showIdeal;
            if (this.idealPathLine) this.idealPathLine.visible = showIdeal;

            // Actualizar datos de telemetría y flechas
            this.updateTelemetryAndVectors(p);

            // Lógica de salto de la barrera (salto sincronizado cuando el balón pasa cerca)
            this.animateBarrierJump(p.pos.z);

            // Cámara de Seguimiento Dinámica
            if (this.activeCameraMode === 'follow') {
                this.camera.position.set(p.pos.x - 3.5, p.pos.y + 1.8, p.pos.z - 4.5);
                this.controls.target.copy(p.pos);
            } else if (this.activeCameraMode === 'tv') {
                // Paneo suave como un camarógrafo humano siguiéndolo
                const targetPos = new THREE.Vector3(p.pos.x, p.pos.y * 0.5, p.pos.z); // No subir tanto la mirada
                this.controls.target.lerp(targetPos, 0.1);
            }

            // Detección de colisiones para disparar efectos visuales y sacudidas
            if (p.collision && p.collision !== this.lastCollisionType) {
                this.lastCollisionType = p.collision;
                this.triggerCollisionEffect(p.collision, p.vel);
            } else if (!p.collision) {
                this.lastCollisionType = null;
            }
        }

        // 1. Animación de vibración de la red ante impactos
        if (this.netDeformation > 0.001) {
            const time = performance.now() * 0.08;
            const amp = this.netDeformation;
            
            if (this.netBack) {
                this.netBack.position.z = (35 + 1.8) + amp * (Math.sin(time) * 0.8 + 0.2);
                this.netBack.position.x = amp * Math.cos(time * 0.7) * 0.3;
            }
            if (this.netTop) {
                this.netTop.position.y = 2.44 + amp * Math.sin(time * 1.1) * 0.4;
                this.netTop.position.z = (35 + 1.8 / 2) + amp * Math.cos(time * 0.9) * 0.4;
            }
            this.netDeformation *= 0.93;
        } else {
            if (this.netBack) {
                this.netBack.position.set(0, 2.44 / 2, 35 + 1.8);
            }
            if (this.netTop) {
                this.netTop.position.set(0, 2.44, 35 + 1.8 / 2);
            }
        }

        // 1.5. Actualizar partículas de explosión de diana
        if (this.particleGroup && this.particleGroup.children.length > 0) {
            const gravity = 9.81;
            const dt = 1 / 60;
            for (let i = this.particleGroup.children.length - 1; i >= 0; i--) {
                const p = this.particleGroup.children[i];
                p.position.addScaledVector(p.userData.velocity, dt);
                p.userData.velocity.y -= gravity * dt;
                p.userData.velocity.multiplyScalar(0.98);
                p.userData.life -= p.userData.decay;
                p.material.opacity = p.userData.life;
                
                if (p.userData.life <= 0) {
                    this.particleGroup.remove(p);
                    p.geometry.dispose();
                    p.material.dispose();
                }
            }
        }

        // 2. Renderizado de la escena con sacudida de cámara (Camera Shake) transitoria
        let shakeOffset = new THREE.Vector3(0, 0, 0);
        if (this.cameraShake && this.cameraShake.length() > 0.01) {
            shakeOffset.copy(this.cameraShake);
            this.camera.position.add(shakeOffset);
            this.cameraShake.multiplyScalar(0.85);
            if (this.cameraShake.length() < 0.002) {
                this.cameraShake.set(0, 0, 0);
            }
        }

        this.renderer.render(this.scene, this.camera);

        if (shakeOffset.length() > 0) {
            this.camera.position.sub(shakeOffset); // Restaurar posición original
        }
    }

    animateBarrierJump(ballZ) {
        if (!this.barrier) return;

        const jumpEnabled = this.currentShootParams && this.currentShootParams.barrierJump !== false;

        // Los jugadores saltan si el balón se aproxima a la barrera (Z entre 6m y 10m)
        this.barrier.children.forEach(player => {
            const distanceZ = Math.abs(ballZ - player.userData.pz);
            if (jumpEnabled && ballZ < player.userData.pz && distanceZ < 6.0) {
                // Curva de salto senoidal basada en la proximidad
                const jumpProgress = (6.0 - distanceZ) / 6.0; // 0 a 1
                const jumpHeight = 0.35 * Math.sin(jumpProgress * Math.PI); // Salto máx de 35cm
                player.position.y = player.userData.baseY + jumpHeight;
            } else if (player.position.y > player.userData.baseY) {
                // Regresar suavemente al suelo después de que pasa el balón o si el salto se desactiva
                player.position.y -= 0.05;
                if (player.position.y < player.userData.baseY) player.position.y = player.userData.baseY;
            }
        });
    }

    checkGoalTrigger() {
        const goalWidthHalf = 7.32 / 2;
        const goalHeight = 2.44;
        
        // Buscamos si el tiro cruzó el plano Z = 35m por primera vez
        let crossedGoal = false;
        
        const crossingPoint = this.trajectoryPoints.find(pt => pt.pos.z >= 35.0);
        if (crossingPoint) {
            // Verificar si en el momento de cruzar la meta estuvo dentro del marco
            if (Math.abs(crossingPoint.pos.x) <= goalWidthHalf && 
                crossingPoint.pos.y <= goalHeight && 
                crossingPoint.pos.y >= 0.1) {
                crossedGoal = true;
            }
        }

        // Detección de impacto en dianas de precisión
        if (this.targetsVisible && this.trajectoryPoints.length > 0) {
            this.precisionTargets.forEach(target => {
                if (target.userData.hit) return; // Ya impactado en este tiro
                
                for (let i = 0; i < this.trajectoryPoints.length; i++) {
                    const pt = this.trajectoryPoints[i];
                    // Si el balón pasa cerca del plano de la diana Z = 34.9
                    const distZ = Math.abs(pt.pos.z - target.position.z);
                    if (distZ < 0.25) {
                        const dx = pt.pos.x - target.position.x;
                        const dy = pt.pos.y - target.position.y;
                        const distH = Math.sqrt(dx * dx + dy * dy);
                        // Umbral de impacto: radio del balón (0.11) + radio de diana (0.4) = 0.51m
                        if (distH < 0.51) {
                            target.userData.hit = true;
                            this.triggerTargetHitEffect(target, new THREE.Vector3(target.position.x, target.position.y, target.position.z));
                            break;
                        }
                    }
                }
            });
        }

        this.showGoalBanner(crossedGoal);
    }

    createPrecisionTargets() {
        const targetPositions = [
            { name: 'Escuadra Izquierda 🎯', x: -3.1, y: 2.0, z: 34.9 },
            { name: 'Escuadra Derecha 🎯', x: 3.1, y: 2.0, z: 34.9 },
            { name: 'Ángulo Inferior Izquierdo 🎯', x: -3.1, y: 0.5, z: 34.9 },
            { name: 'Ángulo Inferior Derecho 🎯', x: 3.1, y: 0.5, z: 34.9 }
        ];

        targetPositions.forEach(pos => {
            const targetGroup = new THREE.Group();
            
            // Anillo exterior (azul)
            const outerGeo = new THREE.RingGeometry(0.35, 0.40, 32);
            const outerMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
            const outer = new THREE.Mesh(outerGeo, outerMat);
            targetGroup.add(outer);

            // Anillo medio (oro)
            const midGeo = new THREE.RingGeometry(0.20, 0.25, 32);
            const midMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
            const mid = new THREE.Mesh(midGeo, midMat);
            targetGroup.add(mid);

            // Centro sólido (rojo)
            const innerGeo = new THREE.CircleGeometry(0.08, 16);
            const innerMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
            const inner = new THREE.Mesh(innerGeo, innerMat);
            targetGroup.add(inner);

            targetGroup.position.set(pos.x, pos.y, pos.z);
            targetGroup.userData = { name: pos.name, hit: false };
            targetGroup.visible = this.targetsVisible;
            
            this.scene.add(targetGroup);
            this.precisionTargets.push(targetGroup);
        });
    }

    setPrecisionTargetsVisible(visible) {
        this.targetsVisible = visible;
        this.precisionTargets.forEach(target => {
            target.visible = visible;
            target.userData.hit = false;
            target.scale.set(1, 1, 1);
            target.children.forEach(child => {
                child.material.opacity = child.geometry.type === 'CircleGeometry' ? 0.9 : 0.8;
            });
        });
        
        // Limpiar partículas previas
        if (this.particleGroup) {
            while (this.particleGroup.children.length > 0) {
                const p = this.particleGroup.children[0];
                this.particleGroup.remove(p);
                p.geometry.dispose();
                p.material.dispose();
            }
        }
    }

    triggerTargetHitEffect(target, position) {
        // Animación visual de impacto (crecer y desvanecer ligeramente)
        target.scale.set(1.3, 1.3, 1.3);
        target.children.forEach(child => {
            child.material.opacity = 0.2;
        });

        // Fuerte sacudida de cámara
        this.cameraShake.set(
            (Math.random() - 0.5) * 0.35,
            (Math.random() - 0.5) * 0.35,
            (Math.random() - 0.5) * 0.35
        );

        // Mostrar mensaje toast
        this.showCollisionMessage(`🎯 ¡DIANA ALCANZADA! 💥<br><span style="font-size: 12px; color: #10b981; font-weight: bold;">${target.userData.name.toUpperCase()} (+1000 pts)</span>`);

        // Crear explosión de confeti de partículas 3D
        const colors = [0x3b82f6, 0xf59e0b, 0xef4444, 0x10b981, 0x8b5cf6];
        const particleCount = 35;
        
        for (let i = 0; i < particleCount; i++) {
            const pGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 8, 8);
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            const pMat = new THREE.MeshBasicMaterial({
                color: randomColor,
                transparent: true,
                opacity: 1.0
            });
            const particle = new THREE.Mesh(pGeo, pMat);
            
            particle.position.copy(position);
            
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            const vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
            const vy = Math.random() * speed + 2;
            const vz = -Math.random() * speed - 1; // Expulsar hacia adelante
            
            particle.userData = {
                velocity: new THREE.Vector3(vx, vy, vz),
                life: 1.0,
                decay: 0.015 + Math.random() * 0.02
            };
            
            this.particleGroup.add(particle);
        }
    }

    showGoalBanner(isGoal) {
        // Remover banner anterior si existiera
        const oldBanner = document.getElementById('goal-banner');
        if (oldBanner) oldBanner.remove();

        if (isGoal) {
            const banner = document.createElement('div');
            banner.id = 'goal-banner';
            banner.className = 'goal-banner show';
            banner.innerHTML = '¡GOLAZO!';
            this.container.appendChild(banner);

            // Generar confeti DOM
            for (let i = 0; i < 40; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti-piece';
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.animation = `confetti-fall ${1.5 + Math.random() * 2}s linear forwards`;
                confetti.style.animationDelay = `${Math.random() * 0.5}s`;
                confetti.style.background = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ffffff'][Math.floor(Math.random() * 6)];
                this.container.appendChild(confetti);
                setTimeout(() => confetti.remove(), 4000);
            }

            // Animación de desvanecimiento tras 3 segundos
            setTimeout(() => {
                banner.style.opacity = '0';
                banner.style.transition = 'opacity 0.5s ease';
                setTimeout(() => banner.remove(), 500);
            }, 3000);
        } else {
            // Mostrar como toast en lugar de banner gigante
            this.showCollisionMessage("FUERA ❌");
        }
    }

    triggerCollisionEffect(type, vel) {
        const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y + vel.z*vel.z);
        if (type === 'post' || type === 'crossbar') {
            // Sacudida fuerte de cámara
            const intensity = Math.min(0.25, speed * 0.008);
            this.cameraShake.set(
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity
            );
            this.showCollisionMessage("¡AL PALO! 🥅💥");
        } else if (type === 'barrier') {
            // Sacudida mediana
            const intensity = Math.min(0.12, speed * 0.005);
            this.cameraShake.set(
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity
            );
            this.showCollisionMessage("¡IMPACTO EN LA BARRERA! 🧍‍♂️💥");

        } else if (type === 'net') {
            // Deformación de red
            this.netDeformation = Math.min(0.25, speed * 0.015);
        }
    }

    showCollisionMessage(text) {
        const oldMessage = document.getElementById('collision-toast');
        if (oldMessage) oldMessage.remove();

        const toast = document.createElement('div');
        toast.id = 'collision-toast';
        toast.style.position = 'absolute';
        toast.style.bottom = '35px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'rgba(239, 68, 68, 0.9)';
        toast.style.color = '#ffffff';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '12px';
        toast.style.fontFamily = "'Outfit', sans-serif";
        toast.style.fontWeight = '700';
        toast.style.fontSize = '16px';
        toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
        toast.style.zIndex = '1000';
        toast.style.pointerEvents = 'none';
        toast.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        toast.style.backdropFilter = 'blur(8px)';
        toast.style.animation = 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        toast.innerHTML = text;

        if (!document.getElementById('toast-style')) {
            const style = document.createElement('style');
            style.id = 'toast-style';
            style.innerHTML = `
                @keyframes popIn {
                    0% { transform: translate(-50%, 20px) scale(0.8); opacity: 0; }
                    100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
                }
                .toast-fade-out {
                    transition: opacity 0.4s ease, transform 0.4s ease;
                    opacity: 0 !important;
                    transform: translate(-50%, -20px) scale(0.9) !important;
                }
            `;
            document.head.appendChild(style);
        }

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 1500);
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }
}
