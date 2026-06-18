/**
 * Módulo de Física para el Simulador del Efecto Magnus
 * Implementa el cálculo de la trayectoria de un balón de fútbol utilizando RK4.
 */

// Constantes físicas
const G_ACCEL = 9.81;        // Gravedad (m/s^2)
const AIR_DENSITY = 1.20;    // Densidad del aire a nivel del mar y 20°C (kg/m^3)
const BALL_MASS = 0.43;      // Masa del balón oficial FIFA tamaño 5 (kg)
const BALL_RADIUS = 0.11;    // Radio del balón (m)
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS; // Área transversal (m^2)
const DRAG_COEFF = 0.25;     // Coeficiente de arrastre estándar para balón de fútbol
const SPIN_DECAY = 0.05;     // Constante de decaimiento del spin por fricción (1/s)

class MagnusPhysicsSolver {
    constructor() {
        this.m = BALL_MASS;
        this.r = BALL_RADIUS;
        this.A = BALL_AREA;
        this.rho = AIR_DENSITY;
        this.g = G_ACCEL;
        this.Cd = DRAG_COEFF;
        this.spinDecay = SPIN_DECAY;
    }

    /**
     * Resuelve la trayectoria completa del balón hasta que toque el suelo (y <= 0) 
     * o supere una distancia límite (z > 45m).
     * 
     * @param {Object} params Parámetros iniciales
     * @param {number} params.speed Velocidad inicial (m/s)
     * @param {number} params.elevation Ángulo de elevación vertical (grados)
     * @param {number} params.azimuth Ángulo de desviación horizontal (grados)
     * @param {number} params.spin Velocidad de rotación inicial (RPM)
     * @param {number} params.spinAngle Inclinación del eje de rotación (grados)
     * @param {Object} params.wind Viento { speed: m/s, angle: grados }
     * @param {boolean} params.includeMagnus Si es falso, calcula la trayectoria ideal sin Magnus
     * @returns {Array} Array de puntos de trayectoria y fuerzas
     */
    calculateTrajectory(params, includeMagnus = true) {
        const points = [];
        const dt = 1 / 120; // Paso de tiempo de integración (120 Hz para alta precisión)
        const goalZ = 35.0;
        const goalWHalf = 7.32 / 2; // 3.66m
        const goalH = 2.44;
        
        // Conversión de ángulos de disparo a radianes
        const theta = params.elevation * Math.PI / 180;
        const phi = params.azimuth * Math.PI / 180;
        
        // Estado inicial [x, y, z, vx, vy, vz]
        // Sistema de coordenadas: 
        // X: Lateral (positivo hacia la derecha, negativo hacia la izquierda)
        // Y: Vertical (positivo hacia arriba, suelo en y = 0)
        // Z: Longitudinal (positivo hacia adelante, portería en z = 32m)
        const startX = params.initialPos ? params.initialPos.x : 0;
        const startY = params.initialPos ? params.initialPos.y : 0.11;
        const startZ = params.initialPos ? params.initialPos.z : 0;

        let state = [
            startX,        // x0: Inicio lateral dinámico
            startY,        // y0: Elevado por el radio del balón
            startZ,        // z0: Línea de tiro dinámica
            params.speed * Math.cos(theta) * Math.sin(phi), // vx0
            params.speed * Math.sin(theta),                 // vy0
            params.speed * Math.cos(theta) * Math.cos(phi)  // vz0
        ];
        
        // Conversión de viento
        // Viento: 0° es a favor (hacia +Z), 180° es en contra (hacia -Z), 90° es cruzado derecha-izquierda (hacia -X), 270° izquierda-derecha (hacia +X)
        const windRad = params.wind.angle * Math.PI / 180;
        const wind = {
            x: -params.wind.speed * Math.sin(windRad),
            y: 0,
            z: params.wind.speed * Math.cos(windRad)
        };
        
        // Conversión de spin (RPM a rad/s)
        const spinRadS = params.spin * (2 * Math.PI / 60);
        const spinAxisAngleRad = params.spinAngle * Math.PI / 180;
        
        // Eje de spin en el plano perpendicular al disparo inicial
        // Mapeo físico:
        // spinAxisAngle = 90°: Eje vertical Y. Spin positivo genera rotación antihoraria (mirando de arriba), curva a la izquierda (-X).
        // spinAxisAngle = 0°: Eje horizontal X. Spin positivo genera topspin, caída abrupta (-Y).
        const initialSpinVector = {
            x: spinRadS * Math.cos(spinAxisAngleRad),
            y: -spinRadS * Math.sin(spinAxisAngleRad),
            z: 0
        };
        
        let t = 0;
        let spinDecayed = { ...initialSpinVector };
        let hasEnteredGoal = false;
        
        // Guardar estado inicial
        const initialForces = this._derivatives(state, wind, spinDecayed, includeMagnus);
        points.push({
            time: t,
            pos: { x: state[0], y: state[1], z: state[2] },
            vel: { x: state[3], y: state[4], z: state[5] },
            speedKmh: Math.sqrt(state[3]*state[3] + state[4]*state[4] + state[5]*state[5]) * 3.6,
            forces: {
                magnus: { x: initialForces[6], y: initialForces[7], z: initialForces[8] },
                drag: { x: initialForces[9], y: initialForces[10], z: initialForces[11] },
                gravity: { x: 0, y: -this.m * this.g, z: 0 }
            },
            spin: { ...spinDecayed }
        });
        
        // Simular hasta que toque el suelo (y < 0.11m, considerando el radio del balón) o vuele demasiado lejos
        // Permitimos una pequeña tolerancia de rebote o simplemente terminar al tocar el suelo
        // Simular la trayectoria con resolución de colisiones y rebotes
        while (t < 3.5 && state[2] < 45 && state[2] > -5 && Math.abs(state[0]) < 25) {
            // Decaimiento del spin por fricción aerodinámica rotacional
            const decayFactor = Math.exp(-this.spinDecay * dt);
            spinDecayed.x *= decayFactor;
            spinDecayed.y *= decayFactor;
            spinDecayed.z *= decayFactor;
            
            // Paso RK4
            const rkResult = this._rk4Step(state, wind, spinDecayed, dt, includeMagnus);
            state = rkResult.state;
            t += dt;

            // Verificar si el balón cruza la línea de gol por dentro del marco
            if (!hasEnteredGoal && state[2] >= 35.0) {
                if (Math.abs(state[0]) < goalWHalf && state[1] < goalH) {
                    hasEnteredGoal = true;
                }
            }

            // --- DETECCION Y RESOLUCION DE COLISIONES ---
            let collision = null;

            // 1. Rebote con el suelo (Césped)
            if (state[1] < 0.11) {
                if (state[4] < 0) { // Moviéndose hacia abajo
                    state[1] = 0.11;
                    state[4] = -state[4] * 0.6; // Coeficiente de restitución del césped (amortiguado)
                    // Fricción horizontal con el césped
                    state[3] *= 0.7;
                    state[5] *= 0.7;
                    // Fricción de rotación en el suelo
                    spinDecayed.x *= 0.6;
                    spinDecayed.y *= 0.6;
                    spinDecayed.z *= 0.6;
                    collision = 'floor';
                } else {
                    state[1] = 0.11; // Asegurar altura mínima al rodar
                    state[4] = 0; // Sin rebote si ya se mueve hacia arriba o es cero
                    // Fricción constante de rodadura
                    state[3] *= 0.98;
                    state[5] *= 0.98;
                }

                // Si la velocidad es insignificante, detener
                const speed = Math.sqrt(state[3]*state[3] + state[4]*state[4] + state[5]*state[5]);
                if (speed < 0.25) {
                    state[3] = 0; state[4] = 0; state[5] = 0;
                    spinDecayed.x = 0; spinDecayed.y = 0; spinDecayed.z = 0;
                    points.push({
                        time: t,
                        pos: { x: state[0], y: state[1], z: state[2] },
                        vel: { x: 0, y: 0, z: 0 },
                        speedKmh: 0,
                        forces: rkResult.forces,
                        spin: { x: 0, y: 0, z: 0 },
                        collision: 'floor'
                    });
                    break;
                }
            }

            // 2. Colisión con la Barrera (4 jugadores en Z = startZ + 9.15m)
            const startZ = params.initialPos ? params.initialPos.z : 0;
            const startX = params.initialPos ? params.initialPos.x : 0;
            const barrierZ = startZ + 9.15;
            const barrierXOffset = params.barrierXOffset !== undefined ? params.barrierXOffset : 0.6;
            const barrierR = 0.22; // Radio de cada jugador
            const ballR = 0.11;
            const numPlayers = 4;
            
            // Altura de los jugadores (con salto incluido)
            const distanceZToBarrier = Math.abs(state[2] - barrierZ);
            let jumpHeight = 0;
            if (state[2] < barrierZ && distanceZToBarrier < 6.0) {
                const jumpProgress = (6.0 - distanceZToBarrier) / 6.0;
                jumpHeight = 0.35 * Math.sin(jumpProgress * Math.PI);
            }
            const playerHeight = 1.82 + jumpHeight;

            for (let i = 0; i < numPlayers; i++) {
                const px = startX + barrierXOffset + i * 0.55;
                const dx = state[0] - px;
                const dz = state[2] - barrierZ;
                const distH = Math.sqrt(dx * dx + dz * dz);
                
                if (distH < (barrierR + ballR)) {
                    if (state[1] - ballR < playerHeight && state[1] + ballR > 0) {
                        const nx = dx / distH;
                        const nz = dz / distH;
                        const dot = state[3] * nx + state[5] * nz;
                        
                        if (dot < 0) { // Moviéndose hacia el jugador
                            const e = 0.45; // Rebote más blando (cuerpo)
                            state[3] = state[3] - (1 + e) * dot * nx;
                            state[5] = state[5] - (1 + e) * dot * nz;
                            state[4] *= 0.8;
                            
                            state[0] = px + nx * (barrierR + ballR + 0.005);
                            state[2] = barrierZ + nz * (barrierR + ballR + 0.005);
                            
                            spinDecayed.x *= 0.5;
                            spinDecayed.y *= 0.5;
                            spinDecayed.z *= 0.5;
                            collision = 'barrier';
                            break;
                        }
                    }
                }
            }

            // 3. Colisión con Postes y Travesaño (en Z = 35m)
            const postR = 0.06;
            
            // Poste Izquierdo (X = -3.66, Z = 35)
            const dxL = state[0] - (-goalWHalf);
            const dzL = state[2] - goalZ;
            const distL = Math.sqrt(dxL * dxL + dzL * dzL);
            if (distL < (postR + ballR) && state[1] - ballR < goalH && state[1] + ballR > 0) {
                const nx = dxL / distL;
                const nz = dzL / distL;
                const dot = state[3] * nx + state[5] * nz;
                if (dot < 0) {
                    const e = 0.75; // Poste duro de metal
                    state[3] = state[3] - (1 + e) * dot * nx;
                    state[5] = state[5] - (1 + e) * dot * nz;
                    state[4] *= 0.9;
                    
                    state[0] = -goalWHalf + nx * (postR + ballR + 0.005);
                    state[2] = goalZ + nz * (postR + ballR + 0.005);
                    
                    spinDecayed.y = -spinDecayed.y * 0.7;
                    collision = 'post';
                }
            }

            // Poste Derecho (X = 3.66, Z = 35)
            const dxR = state[0] - goalWHalf;
            const dzR = state[2] - goalZ;
            const distR = Math.sqrt(dxR * dxR + dzR * dzR);
            if (distR < (postR + ballR) && state[1] - ballR < goalH && state[1] + ballR > 0) {
                const nx = dxR / distR;
                const nz = dzR / distR;
                const dot = state[3] * nx + state[5] * nz;
                if (dot < 0) {
                    const e = 0.75;
                    state[3] = state[3] - (1 + e) * dot * nx;
                    state[5] = state[5] - (1 + e) * dot * nz;
                    state[4] *= 0.9;
                    
                    state[0] = goalWHalf + nx * (postR + ballR + 0.005);
                    state[2] = goalZ + nz * (postR + ballR + 0.005);
                    
                    spinDecayed.y = -spinDecayed.y * 0.7;
                    collision = 'post';
                }
            }

            // Travesaño Superior (Y = 2.44, Z = 35, X entre -3.66 y 3.66)
            if (state[0] >= -goalWHalf - (postR + ballR) && state[0] <= goalWHalf + (postR + ballR)) {
                const dy = state[1] - goalH;
                const dz = state[2] - goalZ;
                const distBar = Math.sqrt(dy * dy + dz * dz);
                if (distBar < (postR + ballR)) {
                    const ny = dy / distBar;
                    const nz = dz / distBar;
                    const dot = state[4] * ny + state[5] * nz;
                    if (dot < 0) {
                        const e = 0.75;
                        state[4] = state[4] - (1 + e) * dot * ny;
                        state[5] = state[5] - (1 + e) * dot * nz;
                        state[3] *= 0.9;
                        
                        state[1] = goalH + ny * (postR + ballR + 0.005);
                        state[2] = goalZ + nz * (postR + ballR + 0.005);
                        
                        spinDecayed.x = -spinDecayed.x * 0.7;
                        collision = 'crossbar';
                    }
                }
            }

            // 4. Colisión con la Red (Z > 35)
            if (state[2] > 35.0) {
                let hitNet = false;
                
                if (hasEnteredGoal) {
                    // --- Colisión con la Red desde el INTERIOR (GOL) ---
                    
                    // Red Trasera (Z = 36.8)
                    if (state[2] >= 36.8 - ballR && Math.abs(state[0]) <= goalWHalf && state[1] <= goalH) {
                        state[2] = 36.8 - ballR;
                        state[5] = -Math.abs(state[5]) * 0.05;
                        state[3] *= 0.1;
                        state[4] *= 0.1;
                        hitNet = true;
                    }
                    // Techo de la Red (Y = 2.44)
                    else if (state[1] >= goalH - ballR && state[2] >= 35.0 && state[2] <= 36.8 && Math.abs(state[0]) <= goalWHalf) {
                        state[1] = goalH - ballR;
                        state[4] = -Math.abs(state[4]) * 0.05;
                        state[3] *= 0.1;
                        state[5] *= 0.1;
                        hitNet = true;
                    }
                    // Redes Laterales (X = +/-3.66)
                    else if (Math.abs(state[0]) >= goalWHalf - ballR && state[2] >= 35.0 && state[2] <= 36.8 && state[1] <= goalH) {
                        state[0] = Math.sign(state[0]) * (goalWHalf - ballR);
                        state[3] = -Math.sign(state[3]) * Math.abs(state[3]) * 0.05;
                        state[4] *= 0.1;
                        state[5] *= 0.1;
                        hitNet = true;
                    }
                } else {
                    // --- Colisión con la Red desde el EXTERIOR (NO GOL) ---
                    
                    // Red Lateral Derecha desde fuera (X = 3.66 + ballR)
                    if (state[0] > goalWHalf && state[0] <= goalWHalf + ballR && state[2] >= 35.0 && state[2] <= 36.8 && state[1] <= goalH) {
                        state[0] = goalWHalf + ballR;
                        state[3] = Math.abs(state[3]) * 0.2; // Rebotar hacia afuera (derecha)
                        hitNet = true;
                    }
                    // Red Lateral Izquierda desde fuera (X = -3.66 - ballR)
                    else if (state[0] < -goalWHalf && state[0] >= -goalWHalf - ballR && state[2] >= 35.0 && state[2] <= 36.8 && state[1] <= goalH) {
                        state[0] = -goalWHalf - ballR;
                        state[3] = -Math.abs(state[3]) * 0.2; // Rebotar hacia afuera (izquierda)
                        hitNet = true;
                    }
                    // Techo de la Red desde fuera (Y = 2.44 + ballR)
                    else if (state[1] > goalH && state[1] <= goalH + ballR && state[2] >= 35.0 && state[2] <= 36.8 && Math.abs(state[0]) <= goalWHalf) {
                        state[1] = goalH + ballR;
                        state[4] = Math.abs(state[4]) * 0.2; // Rebotar hacia arriba
                        hitNet = true;
                    }
                }

                if (hitNet) {
                    spinDecayed.x *= 0.1;
                    spinDecayed.y *= 0.1;
                    spinDecayed.z *= 0.1;
                    collision = 'net';
                }
            }
            
            // Registrar punto
            points.push({
                time: t,
                pos: { x: state[0], y: state[1], z: state[2] },
                vel: { x: state[3], y: state[4], z: state[5] },
                speedKmh: Math.sqrt(state[3]*state[3] + state[4]*state[4] + state[5]*state[5]) * 3.6,
                forces: rkResult.forces,
                spin: { ...spinDecayed },
                collision: collision
            });
        }
        
        return points;
    }

    /**
     * Paso de integración Runge-Kutta de 4to Orden
     * @private
     */
    _rk4Step(state, wind, spinDecayed, dt, includeMagnus) {
        const k1 = this._derivatives(state, wind, spinDecayed, includeMagnus);
        
        const state2 = [
            state[0] + 0.5 * dt * k1[0],
            state[1] + 0.5 * dt * k1[1],
            state[2] + 0.5 * dt * k1[2],
            state[3] + 0.5 * dt * k1[3],
            state[4] + 0.5 * dt * k1[4],
            state[5] + 0.5 * dt * k1[5]
        ];
        const k2 = this._derivatives(state2, wind, spinDecayed, includeMagnus);
        
        const state3 = [
            state[0] + 0.5 * dt * k2[0],
            state[1] + 0.5 * dt * k2[1],
            state[2] + 0.5 * dt * k2[2],
            state[3] + 0.5 * dt * k2[3],
            state[4] + 0.5 * dt * k2[4],
            state[5] + 0.5 * dt * k2[5]
        ];
        const k3 = this._derivatives(state3, wind, spinDecayed, includeMagnus);
        
        const state4 = [
            state[0] + dt * k3[0],
            state[1] + dt * k3[1],
            state[2] + dt * k3[2],
            state[3] + dt * k3[3],
            state[4] + dt * k3[4],
            state[5] + dt * k3[5]
        ];
        const k4 = this._derivatives(state4, wind, spinDecayed, includeMagnus);
        
        const nextState = [];
        for (let i = 0; i < 6; i++) {
            nextState[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
        }
        
        // Fuerzas en el punto inicial del paso para estadísticas
        const forces = {
            magnus: { x: k1[6], y: k1[7], z: k1[8] },
            drag: { x: k1[9], y: k1[10], z: k1[11] },
            gravity: { x: 0, y: -this.m * this.g, z: 0 }
        };
        
        return { state: nextState, forces: forces };
    }

    /**
     * Calcula las derivadas de la velocidad y posición (aceleración y velocidad)
     * Retorna [dx/dt, dy/dt, dz/dt, dvx/dt, dvy/dt, dvz/dt, Fmx, Fmy, Fmz, Fdx, Fdy, Fdz]
     * @private
     */
    _derivatives(state, wind, spinDecayed, includeMagnus) {
        const vx = state[3];
        const vy = state[4];
        const vz = state[5];
        
        // Velocidad relativa al viento
        const vrelx = vx - wind.x;
        const vrely = vy - wind.y;
        const vrelz = vz - wind.z;
        const vrel = Math.sqrt(vrelx*vrelx + vrely*vrely + vrelz*vrelz);
        
        // 1. Gravedad
        const Fgx = 0;
        const Fgy = -this.m * this.g;
        const Fgz = 0;
        
        // AERODINÁMICA AVANZADA: Drag Crisis y Coeficiente No Lineal
        let currentCd = this.Cd;
        if (vrel > 0) {
            // Drag Crisis empírica para un balón de fútbol
            // A más de ~22 m/s el aire es turbulento (Cd ~ 0.15). A menos de ~15 m/s, es laminar (Cd ~ 0.45).
            // Usamos una sigmoide centrada en vc = 18.5 m/s
            const vc = 18.5; 
            const transitionSteepness = 0.4;
            currentCd = 0.15 + (0.45 - 0.15) / (1 + Math.exp(transitionSteepness * (vrel - vc)));
        }

        // 2. Fuerza de Arrastre (Drag)
        let Fdx = 0, Fdy = 0, Fdz = 0;
        if (vrel > 0) {
            // F_drag = -0.5 * Cd * rho * A * |v_rel| * v_rel
            const dragFactor = 0.5 * currentCd * this.rho * this.A * vrel;
            Fdx = -dragFactor * vrelx;
            Fdy = -dragFactor * vrely;
            Fdz = -dragFactor * vrelz;
        }
        
        // 3. Fuerza Magnus y Folha Seca (Knuckleball)
        let Fmx = 0, Fmy = 0, Fmz = 0;
        const omega = Math.sqrt(spinDecayed.x*spinDecayed.x + spinDecayed.y*spinDecayed.y + spinDecayed.z*spinDecayed.z);
        
        if (includeMagnus && vrel > 0) {
            if (omega > 3.0) { // Si hay rotación significativa (Fuerza Magnus pura)
                // Spin parameter S = (omega * r) / v_rel
                const S = (omega * this.r) / vrel;
                // Amplificamos ligeramente la dependencia del spin para potenciar la "mordida" tardía (cuando S sube porque vrel baja)
                const CL = Math.min(0.45, 0.38 * Math.pow(S, 0.65));
                
                const magnusFactor = 0.5 * CL * this.rho * this.A * vrel / omega;
                
                Fmx = magnusFactor * (spinDecayed.y * vrelz - spinDecayed.z * vrely);
                Fmy = magnusFactor * (spinDecayed.z * vrelx - spinDecayed.x * vrelz);
                Fmz = magnusFactor * (spinDecayed.x * vrely - spinDecayed.y * vrelx);
            } else if (vrel > 12 && vrel < 28) { 
                // Efecto Folha Seca / Knuckleball (Vortex Shedding caótico por falta de rotación)
                // Ocurre de forma violenta cerca de la Drag Crisis.
                // Usamos la posición Z (state[2]) como pseudo-tiempo para hacerlo determinístico
                const t = state[2]; 
                const perturbationForceX = Math.sin(t * 1.5) * 0.2 + Math.cos(t * 0.7) * 0.15;
                const perturbationForceY = Math.cos(t * 1.2) * 0.2 + Math.sin(t * 0.9) * 0.15;
                
                // Aplicamos fuerzas oscilatorias que representen ~10-20% de la fuerza gravitacional
                Fmx = perturbationForceX * this.m * this.g * 0.35; 
                Fmy = perturbationForceY * this.m * this.g * 0.35;
            }
        }
        
        // Aceleraciones a = F / m
        const ax = (Fgx + Fdx + Fmx) / this.m;
        const ay = (Fgy + Fdy + Fmy) / this.m;
        const az = (Fgz + Fdz + Fmz) / this.m;
        
        return [
            vx, vy, vz, // dx/dt, dy/dt, dz/dt
            ax, ay, az, // dvx/dt, dvy/dt, dvz/dt
            Fmx, Fmy, Fmz, // Para exportar fuerzas calculadas
            Fdx, Fdy, Fdz
        ];
    }
}

// Función helper global y defensiva para Lucide icons
function replaceLucideIcons() {
    if (typeof lucide !== 'undefined') {
        if (typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        } else if (typeof lucide.replace === 'function') {
            lucide.replace();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MagnusPhysicsSolver, replaceLucideIcons };
}
