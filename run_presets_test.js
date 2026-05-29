const fs = require('fs');
const physicsCode = fs.readFileSync('C:/Users/silversilver/Desktop/03_Proyectos/Magnus/physics.js', 'utf8');
global.lucide = { createIcons: () => {}, replace: () => {} };
const { MagnusPhysicsSolver } = eval(physicsCode + "\nmodule.exports = { MagnusPhysicsSolver };");
const solver = new MagnusPhysicsSolver();

const params = {
    speed: 28.0,
    elevation: 17.0,
    azimuth: 7.5,
    spin: -350,
    spinAngle: 275,
    wind: {speed:0, angle:0},
    initialPos: { x: 2.0, y: 0.11, z: 6.0 },
    barrierXOffset: -0.5
};

const traj = solver.calculateTrajectory(params, true);
const hasHit = traj.some(p => p.collision === 'barrier');
let goalCross = traj.find(p => p.pos.z >= 35.0);
if (goalCross) {
    console.log(`Crosses at x=${goalCross.pos.x.toFixed(2)}, y=${goalCross.pos.y.toFixed(2)}. Hit barrier? ${hasHit}`);
} else {
    console.log('Did not reach goal.');
}
