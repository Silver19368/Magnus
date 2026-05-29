/**
 * Módulo del Controlador de UI y Eventos para el Visualizador del Efecto Magnus
 * Conecta los controles HTML con el motor físico y de renderizado 3D, y gestiona las gráficas.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar simulación de forma segura (defensiva contra fallas de carga de WebGL/CDN)
    let simulation;
    try {
        simulation = new MagnusSimulation('canvas-container');
    } catch (error) {
        console.error("Error al inicializar la simulación 3D:", error);
        showInitializationError("WebGL, Three.js o sus controles no se encuentran cargados o disponibles. Por favor, asegúrate de tener una conexión a internet activa para cargar las librerías CDN, y que tu navegador admita aceleración por hardware (WebGL).");
        return; // Detener ejecución para evitar caídas en cadena
    }
    let charts = {};

    function showInitializationError(message) {
        const container = document.getElementById('canvas-container');
        if (container) {
            container.innerHTML = `
                <div class="webgl-error-container" style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(15, 23, 42, 0.95);
                    border: 1px dashed #ef4444;
                    padding: 30px;
                    border-radius: 16px;
                    max-width: 85%;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    z-index: 1000;
                    backdrop-filter: blur(8px);
                ">
                    <div style="font-size: 40px; margin-bottom: 12px;">⚠️</div>
                    <h3 style="color: #f1f5f9; font-size: 18px; font-weight: 700; margin-bottom: 10px; font-family: 'Outfit', sans-serif;">Error de Inicialización</h3>
                    <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 15px; font-family: sans-serif;">${message}</p>
                    <button onclick="window.location.reload()" style="
                        background: #2563eb;
                        color: #ffffff;
                        border: none;
                        padding: 8px 20px;
                        border-radius: 8px;
                        font-family: 'Outfit', sans-serif;
                        font-weight: 600;
                        font-size: 12px;
                        cursor: pointer;
                        transition: background 0.2s;
                    ">Recargar Página</button>
                </div>
            `;
            replaceLucideIcons();
        }
    }

    // Obtener referencias de elementos de la UI
    const inputs = {
        speed: document.getElementById('input-speed'),
        elevation: document.getElementById('input-elevation'),
        azimuth: document.getElementById('input-azimuth'),
        spin: document.getElementById('input-spin'),
        spinAngle: document.getElementById('input-spin-angle'),
        windSpeed: document.getElementById('input-wind-speed'),
        windAngle: document.getElementById('input-wind-angle'),
        altitude: document.getElementById('input-altitude'),
        vectors: document.getElementById('toggle-vectors'),
        ideal: document.getElementById('toggle-ideal'),
        targets: document.getElementById('toggle-targets'),
        distance: document.getElementById('input-distance'),
        lateral: document.getElementById('input-lateral'),
        barrierPlayers: document.getElementById('input-barrier-players'),
        barrierJump: document.getElementById('input-barrier-jump'),
        barrierPos: document.getElementById('input-barrier-pos')
    };

    const displays = {
        speed: document.getElementById('val-speed'),
        speedKmh: document.getElementById('val-speed-kmh'),
        elevation: document.getElementById('val-elevation'),
        azimuth: document.getElementById('val-azimuth'),
        spin: document.getElementById('val-spin'),
        spinAngle: document.getElementById('val-spin-angle'),
        windSpeed: document.getElementById('val-wind-speed'),
        windAngle: document.getElementById('val-wind-angle'),
        altitude: document.getElementById('val-altitude'),
        airDensity: document.getElementById('val-air-density'),
        altitudeLandmark: document.getElementById('altitude-landmark'),
        distance: document.getElementById('val-distance'),
        lateral: document.getElementById('val-lateral'),
        barrierPlayers: document.getElementById('val-barrier-players'),
        barrierPos: document.getElementById('val-barrier-pos')
    };

    const buttons = {
        shoot: document.getElementById('btn-shoot'),
        playPause: document.getElementById('btn-play-pause'),
        reset: document.getElementById('btn-reset'),
        fullscreen: document.getElementById('btn-fullscreen'),
        cameras: {
            kick: document.getElementById('cam-kick'),
            gk: document.getElementById('cam-gk'),
            top: document.getElementById('cam-top'),
            follow: document.getElementById('cam-follow'),
            tv: document.getElementById('cam-tv'),
            orbit: document.getElementById('cam-orbit')
        }
    };

    // 1. Inicializar Gráficas de Chart.js
    try {
        initCharts();
    } catch (error) {
        console.error("Error al inicializar Chart.js:", error);
        // Mock de gráficos para evitar caídas en cadena si Chart.js no cargó
        charts.side = { update: () => {}, options: { scales: { x: {}, y: {} } }, data: { datasets: [{}, {}] } };
        charts.top = { update: () => {}, options: { scales: { x: {}, y: {} } }, data: { datasets: [{}, {}] } };
        charts.forces = { update: () => {}, options: { scales: { x: {}, y: {} } }, data: { datasets: [{}, {}, {}] } };
    }

    // 2. Dibujar indicador del eje de rotación inicial
    drawSpinAxisIndicator();

    // 3. Ejecutar cálculo físico inicial y actualizar visualización
    updateTrajectory();

    // 4. Enlazar eventos de controles deslizantes (Sliders)
    setupSliders();

    // 5. Enlazar eventos de botones de control de simulación
    setupSimulationButtons();

    // 6. Enlazar eventos de botones de cámara
    setupCameraButtons();

    // 7. Enlazar evento de Pantalla Completa
    setupFullscreen();

    // 8. Enlazar Toggles de visualización
    inputs.vectors.addEventListener('change', () => {
        if (simulation.trajectoryPoints.length > 0) {
            const currentPt = simulation.trajectoryPoints[simulation.currentFrame];
            simulation.updateTelemetryAndVectors(currentPt);
        }
    });

    inputs.ideal.addEventListener('change', () => {
        const showIdeal = inputs.ideal.checked;
        if (simulation.idealPathLine) {
            simulation.idealPathLine.visible = showIdeal;
            simulation.idealBall.visible = showIdeal;
        }
    });

    // 8.5. Enlazar Dianas de Precisión
    inputs.targets.addEventListener('change', () => {
        const checked = inputs.targets.checked;
        simulation.setPrecisionTargetsVisible(checked);
    });

    // 8.6. Enlazar Cajón Deslizante de Presets Históricos
    const presetsDrawer = document.getElementById('historical-presets-drawer');
    const presetsTabTrigger = document.getElementById('presets-tab-trigger');

    if (presetsTabTrigger && presetsDrawer) {
        presetsTabTrigger.addEventListener('click', () => {
            presetsDrawer.classList.toggle('open');
            const isOpen = presetsDrawer.classList.contains('open');
            presetsTabTrigger.classList.toggle('active', isOpen);
        });
    }

    // 8.7. Diccionario y Carga de Presets Históricos Legendarios
    const historicalPresets = {
        'preset-rc97': {
            speed: 36.0,
            elevation: 11.0,
            azimuth: 12.5,
            spin: 700,
            spinAngle: 90,
            windSpeed: 0,
            windAngle: 0,
            altitude: 0,
            initialPos: { x: 0, y: 0.11, z: 0 },
            barrierXOffset: 0.8
        },
        'preset-cr08': {
            speed: 31.5,
            elevation: 15.5,
            azimuth: 0.0,
            spin: 100,
            spinAngle: 30,
            windSpeed: 0,
            windAngle: 0,
            altitude: 0,
            initialPos: { x: 1.0, y: 0.11, z: 7.0 }, // 28m de la meta
            barrierXOffset: -0.5
        },
        'preset-messi19': {
            speed: 29.0,
            elevation: 17.0,
            azimuth: 7.0,
            spin: 900,
            spinAngle: 85,
            windSpeed: 0,
            windAngle: 0,
            altitude: 0,
            initialPos: { x: -2.0, y: 0.11, z: 6.0 }, // 29m de la meta
            barrierXOffset: 0.5
        },
        'preset-r1002': {
            speed: 30.0,
            elevation: 22.0,
            azimuth: -13.0,
            spin: 550,
            spinAngle: 85,
            windSpeed: 0,
            windAngle: 0,
            altitude: 0,
            initialPos: { x: 13.5, y: 0.11, z: -3.0 }, // 38m de la meta en banda derecha
            barrierXOffset: -1.5
        }
    };

    Object.entries(historicalPresets).forEach(([id, preset]) => {
        const card = document.getElementById(id);
        if (card) {
            card.addEventListener('click', () => {
                // Quitar clase activa de otros y agregar a la seleccionada
                document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                // Establecer los valores de sliders
                inputs.speed.value = preset.speed;
                inputs.elevation.value = preset.elevation;
                inputs.azimuth.value = preset.azimuth;
                inputs.spin.value = preset.spin;
                inputs.spinAngle.value = preset.spinAngle;
                inputs.windSpeed.value = preset.windSpeed;
                inputs.windAngle.value = preset.windAngle;
                inputs.altitude.value = preset.altitude;
                inputs.distance.value = 35.0 - (preset.initialPos ? preset.initialPos.z : 0);
                inputs.lateral.value = preset.initialPos ? preset.initialPos.x : 0;
                if (inputs.barrierPos) {
                    inputs.barrierPos.value = preset.barrierXOffset !== undefined ? preset.barrierXOffset : 0.6;
                }

                // Disparar eventos de entrada (input) para actualizar la visualización de la UI
                const event = new Event('input', { bubbles: true });
                inputs.speed.dispatchEvent(event);
                inputs.elevation.dispatchEvent(event);
                inputs.azimuth.dispatchEvent(event);
                inputs.spin.dispatchEvent(event);
                inputs.spinAngle.dispatchEvent(event);
                inputs.windSpeed.dispatchEvent(event);
                inputs.windAngle.dispatchEvent(event);
                inputs.altitude.dispatchEvent(event);
                inputs.distance.dispatchEvent(event);
                inputs.lateral.dispatchEvent(event);
                if (inputs.barrierPos) inputs.barrierPos.dispatchEvent(event);

                // Activar automáticamente la cámara de TV Broadcast
                simulation.setCameraMode('tv');

                // Calcular trayectoria inmediatamente
                updateTrajectory();

                // Colapsar suavemente después de seleccionar
                setTimeout(() => {
                    presetsDrawer.classList.remove('open');
                    presetsTabTrigger.classList.remove('active');
                }, 400);
            });
        }
    });

    // Reemplazar iconos Lucide cargados dinámicamente
    replaceLucideIcons();

    /* ==========================================================================
       FUNCIONES DEL CONTROLADOR
       ========================================================================== */

    /**
     * Calcula la densidad del aire (kg/m3) a partir de la altitud (m) usando el modelo barométrico estándar
     */
    function getAirDensityAtAltitude(altitude) {
        // Altura en metros. Densidad a nivel del mar (0m) = 1.20 kg/m3 para mantener consistencia.
        return 1.20 * Math.pow(1 - 0.0065 * altitude / 288.15, 4.25588);
    }

    /**
     * Lee los valores actuales de los controles deslizantes
     */
    function getParamsFromUI() {
        const distanceVal = parseFloat(inputs.distance.value);
        const lateralVal = parseFloat(inputs.lateral.value);
        
        let initialPos = { 
            x: lateralVal, 
            y: 0.11, 
            z: 35.0 - distanceVal 
        };
        
        let barrierXOffset = inputs.barrierPos ? parseFloat(inputs.barrierPos.value) : 0.6;

        return {
            speed: parseFloat(inputs.speed.value),
            elevation: parseFloat(inputs.elevation.value),
            azimuth: parseFloat(inputs.azimuth.value),
            spin: parseFloat(inputs.spin.value),
            spinAngle: parseFloat(inputs.spinAngle.value),
            wind: {
                speed: parseFloat(inputs.windSpeed.value),
                angle: parseFloat(inputs.windAngle.value)
            },
            airDensity: getAirDensityAtAltitude(parseFloat(inputs.altitude.value)),
            initialPos: initialPos,
            barrierXOffset: barrierXOffset,
            barrierPlayers: parseInt(inputs.barrierPlayers ? inputs.barrierPlayers.value : 4),
            barrierJump: inputs.barrierJump ? inputs.barrierJump.checked : true
        };
    }

    /**
     * Ejecuta el cálculo físico e inyecta la trayectoria y las gráficas
     */
    function updateTrajectory() {
        const params = getParamsFromUI();
        
        // Ejecutar simulación física
        simulation.runPhysicsCalculation(params);
        
        // Actualizar gráficas en tiempo real
        updateChartsData();
        
        // Si no está corriendo, actualizar vectores al frame inicial
        if (!simulation.isPlaying && simulation.trajectoryPoints.length > 0) {
            simulation.updateTelemetryAndVectors(simulation.trajectoryPoints[0]);
        }
    }

    /**
     * Configura el comportamiento de los Sliders
     */
    function setupSliders() {
        // Objeto de mapeo para actualizar dinámicamente las etiquetas de valor
        const sliderMappings = [
            { slider: inputs.speed, display: displays.speed, suffix: ' m/s', callback: (val) => {
                displays.speedKmh.textContent = (parseFloat(val) * 3.6).toFixed(1);
            }},
            { slider: inputs.elevation, display: displays.elevation, suffix: '°' },
            { slider: inputs.azimuth, display: displays.azimuth, suffix: '°' },
            { slider: inputs.spin, display: displays.spin, suffix: ' RPM' },
            { slider: inputs.spinAngle, display: displays.spinAngle, suffix: '°', callback: drawSpinAxisIndicator },
            { slider: inputs.windSpeed, display: displays.windSpeed, suffix: ' m/s' },
            { slider: inputs.windAngle, display: displays.windAngle, suffix: '°' },
            { slider: inputs.distance, display: displays.distance, suffix: ' m' },
            { slider: inputs.lateral, display: displays.lateral, suffix: ' m' },
            { slider: inputs.altitude, display: displays.altitude, suffix: ' m', callback: (val) => {
                const alt = parseFloat(val);
                const density = getAirDensityAtAltitude(alt);
                displays.airDensity.textContent = density.toFixed(2) + ' kg/m³';
                
                // Determinar el hito de altitud (landmark)
                let landmarkText = "Altitud baja";
                if (alt === 0) {
                    landmarkText = "Nivel del mar (0 m)";
                } else if (alt > 0 && alt < 1000) {
                    landmarkText = "Altitud baja";
                } else if (alt >= 1000 && alt < 2200) {
                    landmarkText = "Altitud media (ej. Madrid: ~650m)";
                } else if (alt >= 2200 && alt <= 2300) {
                    landmarkText = "CDMX (~2240 m) - Menor resistencia y comba";
                } else {
                    landmarkText = "Altitud elevada (ej. Bogotá: ~2600m)";
                }
                displays.altitudeLandmark.textContent = landmarkText;
            }},
            { slider: inputs.barrierPlayers, display: displays.barrierPlayers, suffix: '' },
            { slider: inputs.barrierPos, display: displays.barrierPos, suffix: ' m' }
        ];

        sliderMappings.forEach(mapping => {
            if(!mapping.slider) return;
            mapping.slider.addEventListener('input', (e) => {
                const val = e.target.value;
                if(mapping.display) {
                    mapping.display.textContent = val + mapping.suffix;
                    
                    // Activar animación de "pop"
                    mapping.display.classList.remove('popping');
                    void mapping.display.offsetWidth; // forzar reflow
                    mapping.display.classList.add('popping');
                }
                
                if (mapping.callback) mapping.callback(val);
                
                // Recalcular trayectorias en tiempo real para una interactividad fluida
                updateTrajectory();
            });
        });

        if (inputs.barrierJump) {
            inputs.barrierJump.addEventListener('change', () => {
                updateTrajectory();
            });
        }
    }

    /**
     * Enlaza botones de ejecución (Play, Pausa, Reset)
     */
    function setupSimulationButtons() {
        buttons.shoot.addEventListener('click', () => {
            // Eliminar banner de gol previo si existe
            const banner = document.getElementById('goal-banner');
            if (banner) banner.remove();
            
            simulation.resetSimulation();
            simulation.startSimulation();
        });

        buttons.playPause.addEventListener('click', () => {
            if (simulation.isPlaying) {
                simulation.pauseSimulation();
            } else {
                simulation.startSimulation();
            }
        });

        buttons.reset.addEventListener('click', () => {
            const banner = document.getElementById('goal-banner');
            if (banner) banner.remove();
            document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
            updateTrajectory(); // Esto recalcula y reubica el balón/barrera a la posición por defecto
            simulation.resetSimulation();
        });

        // Controles de velocidad (1x, 0.5x, 0.25x)
        document.querySelectorAll('.btn-speed').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                simulation.simulationSpeed = parseFloat(e.target.dataset.speed);
            });
        });
    }

    /**
     * Enlaza los botones de selección de cámara
     */
    function setupCameraButtons() {
        Object.entries(buttons.cameras).forEach(([mode, btn]) => {
            btn.addEventListener('click', () => {
                simulation.setCameraMode(mode);
            });
        });
    }

    /**
     * Configura el comportamiento del botón de Pantalla Completa y su HUD adaptativo
     */
    function setupFullscreen() {
        if (!buttons.fullscreen) return;

        const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        const sidebarPanel = document.getElementById('sidebar-panel');
        const container = document.querySelector('.app-main');

        buttons.fullscreen.addEventListener('click', () => {
            if (!container) return;

            if (!document.fullscreenElement) {
                container.requestFullscreen().catch(err => {
                    console.error(`Error al intentar activar pantalla completa: ${err.message}`);
                });
            } else {
                document.exitFullscreen().catch(err => {
                    console.error(`Error al intentar salir de pantalla completa: ${err.message}`);
                });
            }
        });

        // Alternancia de la barra lateral de controles
        if (btnToggleSidebar && sidebarPanel && container) {
            btnToggleSidebar.addEventListener('click', () => {
                sidebarPanel.classList.toggle('collapsed');
                container.classList.toggle('sidebar-collapsed');
                
                // Cambiar el icono del botón (chevron-left a chevron-right)
                const icon = btnToggleSidebar.querySelector('i');
                if (icon) {
                    if (sidebarPanel.classList.contains('collapsed')) {
                        icon.setAttribute('data-lucide', 'chevron-right');
                        btnToggleSidebar.title = "Mostrar parámetros";
                    } else {
                        icon.setAttribute('data-lucide', 'chevron-left');
                        btnToggleSidebar.title = "Ocultar parámetros";
                    }
                    replaceLucideIcons();
                }
                
                // Forzar redimensionamiento del canvas 3D
                if (simulation && typeof simulation.onWindowResize === 'function') {
                    simulation.onWindowResize();
                    setTimeout(() => simulation.onWindowResize(), 100);
                }
            });
        }

        // Atajo teclado 'H' para ocultar/mostrar todo el HUD en pantalla completa
        document.addEventListener('keydown', (e) => {
            if (document.fullscreenElement && (e.key === 'h' || e.key === 'H') && container) {
                // Evitar disparar si se escribe en inputs
                const activeTag = document.activeElement ? document.activeElement.tagName : '';
                if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
                    container.classList.toggle('hud-hidden');
                }
            }
        });

        // Escuchar el cambio de estado global de pantalla completa (por si salen con Esc o F11)
        const handleFullscreenChange = () => {
            const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (isFS) {
                if (container) container.classList.add('is-fullscreen');
                buttons.fullscreen.innerHTML = '<i data-lucide="minimize"></i>';
                buttons.fullscreen.title = "Salir de Pantalla Completa";
                showFullscreenTip("Atajo: Presiona la tecla [H] para ocultar o mostrar la interfaz (HUD)");
            } else {
                buttons.fullscreen.innerHTML = '<i data-lucide="maximize"></i>';
                buttons.fullscreen.title = "Pantalla Completa";
                
                // Limpiar estados de colapsado y ocultamiento al salir
                if (sidebarPanel) sidebarPanel.classList.remove('collapsed');
                if (container) {
                    container.classList.remove('is-fullscreen');
                    container.classList.remove('sidebar-collapsed');
                    container.classList.remove('hud-hidden');
                }
                if (btnToggleSidebar) {
                    const icon = btnToggleSidebar.querySelector('i');
                    if (icon) {
                        icon.setAttribute('data-lucide', 'chevron-left');
                    }
                    btnToggleSidebar.title = "Ocultar parámetros";
                }
            }
            replaceLucideIcons();

            // Forzar redimensionamiento inmediato y diferido del renderizador 3D
            if (simulation && typeof simulation.onWindowResize === 'function') {
                simulation.onWindowResize();
                setTimeout(() => simulation.onWindowResize(), 50);
                setTimeout(() => simulation.onWindowResize(), 150);
                setTimeout(() => simulation.onWindowResize(), 300);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    }

    /**
     * Muestra una sugerencia flotante temporal (toast) cuando se activa la pantalla completa
     */
    function showFullscreenTip(message) {
        const existingTip = document.getElementById('fullscreen-hud-tip');
        if (existingTip) existingTip.remove();

        const tip = document.createElement('div');
        tip.id = 'fullscreen-hud-tip';
        tip.style.position = 'absolute';
        tip.style.top = '100px';
        tip.style.left = '50%';
        tip.style.transform = 'translateX(-50%) translateY(-20px)';
        tip.style.background = 'rgba(15, 23, 42, 0.9)';
        tip.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        tip.style.color = '#e2e8f0';
        tip.style.padding = '10px 20px';
        tip.style.borderRadius = '20px';
        tip.style.fontSize = '12px';
        tip.style.fontWeight = '500';
        tip.style.fontFamily = "'Outfit', sans-serif";
        tip.style.zIndex = '2000';
        tip.style.opacity = '0';
        tip.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        tip.style.pointerEvents = 'none';
        tip.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 10px rgba(16, 185, 129, 0.2)';
        
        tip.innerHTML = `<i data-lucide="info" style="width: 14px; height: 14px; color: #10b981; vertical-align: middle; margin-right: 6px;"></i> ${message}`;
        
        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(tip);
            replaceLucideIcons();
            
            // Forzar reflow y animar entrada
            void tip.offsetWidth;
            tip.style.opacity = '1';
            tip.style.transform = 'translateX(-50%) translateY(0)';
            
            // Desvanecer después de 4 segundos
            setTimeout(() => {
                tip.style.opacity = '0';
                tip.style.transform = 'translateX(-50%) translateY(-10px)';
                setTimeout(() => tip.remove(), 400);
            }, 4000);
        }
    }




    /**
     * Dibuja un mini widget 2D para mostrar visualmente el eje de rotación (spinAxis)
     */
    function drawSpinAxisIndicator() {
        const canvas = document.getElementById('spin-axis-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = canvas.width / 2 - 10;
        
        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 1. Dibujar esfera del balón en 2D (círculo gris con degradado suave)
        const ballGrad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, radius);
        ballGrad.addColorStop(0, '#f8fafc');
        ballGrad.addColorStop(0.8, '#cbd5e1');
        ballGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Dibujar costuras/elipses del balón 2D como adorno estético
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * 0.4, radius, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 2. Calcular ángulo del eje de rotación
        // spinAngle = 90°: eje vertical (línea vertical).
        // spinAngle = 0°: eje horizontal.
        const angleDeg = parseFloat(inputs.spinAngle.value);
        const angleRad = angleDeg * Math.PI / 180;
        
        // Coordenadas del vector del eje
        const dx = Math.cos(angleRad) * (radius + 5);
        const dy = -Math.sin(angleRad) * (radius + 5); // Invertimos Y en canvas
        
        // 3. Dibujar Eje de rotación (Línea verde neón brillante)
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
        
        // Puntas del eje (círculos pequeños)
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 4, 0, Math.PI * 2);
        ctx.arc(cx - dx, cy - dy, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Quitar sombras para el resto de dibujos
        ctx.shadowBlur = 0;

        // 4. Dibujar flechas curvas de giro rotacional
        // Indicamos con flechas la dirección de rotación si el spin != 0
        const spinVal = parseFloat(inputs.spin.value);
        if (Math.abs(spinVal) > 10) {
            ctx.strokeStyle = '#f59e0b'; // Color oro
            ctx.lineWidth = 2.5;
            
            // Dibujar flecha curva en un lado del balón perpendicular al eje
            // Ángulo perpendicular
            const perpRad = angleRad + Math.PI/2;
            const px = Math.cos(perpRad) * (radius * 0.7);
            const py = -Math.sin(perpRad) * (radius * 0.7);
            
            ctx.beginPath();
            // Arco de giro rotacional
            if (spinVal > 0) {
                // Sentido de giro directo
                ctx.arc(cx, cy, radius * 0.7, perpRad - 0.4, perpRad + 0.4);
                ctx.stroke();
                // Dibujar punta de flecha al final
                const arrowX = cx + Math.cos(perpRad + 0.4) * (radius * 0.7);
                const arrowY = cy - Math.sin(perpRad + 0.4) * (radius * 0.7);
                drawArrowHead(ctx, arrowX, arrowY, perpRad + 0.4 + Math.PI/2);
            } else {
                // Sentido de giro inverso
                ctx.arc(cx, cy, radius * 0.7, perpRad + 0.4, perpRad - 0.4, true);
                ctx.stroke();
                // Dibujar punta de flecha al final
                const arrowX = cx + Math.cos(perpRad - 0.4) * (radius * 0.7);
                const arrowY = cy - Math.sin(perpRad - 0.4) * (radius * 0.7);
                drawArrowHead(ctx, arrowX, arrowY, perpRad - 0.4 - Math.PI/2);
            }
        }
    }

    function drawArrowHead(ctx, x, y, angle) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle + 2.3) * 6, y - Math.sin(angle + 2.3) * 6);
        ctx.lineTo(x + Math.cos(angle - 2.3) * 6, y - Math.sin(angle - 2.3) * 6);
        ctx.closePath();
        ctx.fill();
    }

    /* ==========================================================================
       SECCIÓN DE GRÁFICAS (CHART.JS)
       ========================================================================== */

    function initCharts() {
        const fontConfig = {
            family: 'Outfit',
            size: 11
        };

        // 1. Gráfica Vista Lateral (Altura Y vs Distancia Z)
        const ctxSide = document.getElementById('chart-side-view').getContext('2d');
        charts.side = new Chart(ctxSide, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Con Magnus',
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251, 191, 36, 0.05)',
                        borderWidth: 2.5,
                        pointRadius: 0,
                        data: []
                    },
                    {
                        label: 'Sin Magnus',
                        borderColor: '#94a3b8',
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'VISTA LATERAL: ALTURA vs DISTANCIA', color: '#f1f5f9', font: { ...fontConfig, weight: 'bold' } },
                    legend: { labels: { color: '#94a3b8', font: fontConfig } }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Distancia (m)', color: '#94a3b8', font: fontConfig },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: fontConfig },
                        min: 0,
                        max: 45
                    },
                    y: {
                        title: { display: true, text: 'Altura (m)', color: '#94a3b8', font: fontConfig },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: fontConfig },
                        min: 0,
                        max: 6
                    }
                }
            }
        });

        // 2. Gráfica Vista Cenital (Desviación Lateral X vs Distancia Z)
        const ctxTop = document.getElementById('chart-top-view').getContext('2d');
        charts.top = new Chart(ctxTop, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Con Magnus',
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251, 191, 36, 0.05)',
                        borderWidth: 2.5,
                        pointRadius: 0,
                        data: []
                    },
                    {
                        label: 'Sin Magnus',
                        borderColor: '#94a3b8',
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'VISTA AÉREA: CURVA LATERAL vs DISTANCIA', color: '#f1f5f9', font: { ...fontConfig, weight: 'bold' } },
                    legend: { labels: { color: '#94a3b8', font: fontConfig } }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Distancia (m)', color: '#94a3b8', font: fontConfig },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: fontConfig },
                        min: 0,
                        max: 45
                    },
                    y: {
                        title: { display: true, text: 'Desviación Lateral (m)', color: '#94a3b8', font: fontConfig },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: fontConfig },
                        min: -6,
                        max: 6
                    }
                }
            }
        });

        // 3. Gráfica de Fuerzas (Magnitud de Fuerzas vs Tiempo)
        const ctxForces = document.getElementById('chart-forces').getContext('2d');
        charts.forces = new Chart(ctxForces, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'F. Magnus',
                        borderColor: '#fbbf24',
                        borderWidth: 2,
                        pointRadius: 0,
                        data: []
                    },
                    {
                        label: 'F. Arrastre',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        pointRadius: 0,
                        data: []
                    },
                    {
                        label: 'F. Gravedad',
                        borderColor: '#8b5cf6',
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        pointRadius: 0,
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'FUERZAS FÍSICAS DURANTE EL VUELO', color: '#f1f5f9', font: { ...fontConfig, weight: 'bold' } },
                    legend: { labels: { color: '#94a3b8', font: fontConfig } }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Tiempo (s)', color: '#94a3b8', font: fontConfig },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: fontConfig },
                        min: 0,
                        max: 1.8
                    },
                    y: {
                        title: { display: true, text: 'Fuerza (Newtons)', color: '#94a3b8', font: fontConfig },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#94a3b8', font: fontConfig },
                        min: 0,
                        max: 12
                    }
                }
            }
        });
    }

    /**
     * Rellena las gráficas con los puntos recién calculados
     */
    function updateChartsData() {
        const ptsMagnus = simulation.trajectoryPoints;
        const ptsIdeal = simulation.idealTrajectoryPoints;

        if (ptsMagnus.length === 0) return;

        // 1. Vista Lateral
        charts.side.data.datasets[0].data = ptsMagnus.map(p => ({ x: p.pos.z, y: p.pos.y }));
        charts.side.data.datasets[1].data = ptsIdeal.map(p => ({ x: p.pos.z, y: p.pos.y }));
        
        // Ajustar límites del eje X dinámicamente al vuelo real del balón y posición de inicio
        const maxZ = Math.max(
            ptsMagnus[ptsMagnus.length - 1].pos.z, 
            ptsIdeal[ptsIdeal.length - 1].pos.z,
            36
        );
        const minZ = Math.min(
            ptsMagnus[0].pos.z,
            ptsIdeal[0].pos.z,
            0
        );
        const xMinBound = Math.floor(minZ / 5) * 5;
        const xMaxBound = Math.ceil(maxZ / 5) * 5;

        charts.side.options.scales.x.min = xMinBound;
        charts.side.options.scales.x.max = xMaxBound;

        // Ajustar eje Y máximo a la altura máxima alcanzada
        const maxY = Math.max(
            ...ptsMagnus.map(p => p.pos.y),
            ...ptsIdeal.map(p => p.pos.y),
            2.5
        );
        charts.side.options.scales.y.max = Math.ceil(maxY + 0.5);
        charts.side.update();

        // 2. Vista Cenital
        charts.top.data.datasets[0].data = ptsMagnus.map(p => ({ x: p.pos.z, y: p.pos.x }));
        charts.top.data.datasets[1].data = ptsIdeal.map(p => ({ x: p.pos.z, y: p.pos.x }));
        charts.top.options.scales.x.min = xMinBound;
        charts.top.options.scales.x.max = xMaxBound;
        
        // Ajustar eje Y (Desviación lateral) simétricamente
        const maxX = Math.max(
            ...ptsMagnus.map(p => Math.abs(p.pos.x)),
            ...ptsIdeal.map(p => Math.abs(p.pos.x)),
            4
        );
        const yBound = Math.ceil(maxX + 0.5);
        charts.top.options.scales.y.min = -yBound;
        charts.top.options.scales.y.max = yBound;
        charts.top.update();

        // 3. Fuerzas
        charts.forces.data.datasets[0].data = ptsMagnus.map(p => ({
            x: p.time,
            y: Math.sqrt(p.forces.magnus.x**2 + p.forces.magnus.y**2 + p.forces.magnus.z**2)
        }));
        
        charts.forces.data.datasets[1].data = ptsMagnus.map(p => ({
            x: p.time,
            y: Math.sqrt(p.forces.drag.x**2 + p.forces.drag.y**2 + p.forces.drag.z**2)
        }));
        
        const fg = BALL_MASS * G_ACCEL;
        charts.forces.data.datasets[2].data = ptsMagnus.map(p => ({
            x: p.time,
            y: fg
        }));

        const maxT = ptsMagnus[ptsMagnus.length - 1].time;
        charts.forces.options.scales.x.max = Math.ceil(maxT * 10) / 10;
        
        // Obtener fuerza máxima para escalar eje Y
        const maxForceVal = Math.max(
            ...charts.forces.data.datasets[0].data.map(d => d.y),
            ...charts.forces.data.datasets[1].data.map(d => d.y),
            fg,
            8
        );
        charts.forces.options.scales.y.max = Math.ceil(maxForceVal + 1);
        charts.forces.update();
    }
});
