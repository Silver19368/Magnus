const fs = require('fs');
const physicsCode = fs.readFileSync('C:/Users/silversilver/Desktop/03_Proyectos/Magnus/physics.js', 'utf8');

global.lucide = { createIcons: () => {}, replace: () => {} };

const { MagnusPhysicsSolver } = eval(physicsCode + "\nmodule.exports = { MagnusPhysicsSolver };");
const solver = new MagnusPhysicsSolver();

function testShot(name, params) {
    const traj = solver.calculateTrajectory(params, true);
    const end = traj[traj.length - 1];
    let goalCross = traj.find(p => p.pos.z >= 35.0);
    
    console.log('--- ' + name + ' ---');
    if (goalCross) {
        console.log('Crosses Z=35 at: x=' + goalCross.pos.x.toFixed(2) + ' y=' + goalCross.pos.y.toFixed(2));
        const isGoal = Math.abs(goalCross.pos.x) < 3.66 && goalCross.pos.y > 0 && goalCross.pos.y < 2.44;
        console.log('Goal?', isGoal);
    } else {
        console.log('Did not reach Z=35. Ended at:', end.pos);
    }
}

// RC97
testShot('RC97 Current', { speed: 41.5, elevation: 14.5, azimuth: 15.0, spin: -825, spinAngle: 105, wind: {speed:0, angle:0}, initialPos: {x:0, y:0.11, z:0} });
testShot('RC97 Left 1', { speed: 38, elevation: 12.5, azimuth: 14, spin: 850, spinAngle: 95, wind: {speed:0, angle:0}, initialPos: {x:0, y:0.11, z:0} });
testShot('RC97 Left 2', { speed: 38.5, elevation: 13.0, azimuth: 17, spin: 1000, spinAngle: 90, wind: {speed:0, angle:0}, initialPos: {x:0, y:0.11, z:0} });
testShot('RC97 Left 3', { speed: 40, elevation: 13.5, azimuth: 16, spin: 900, spinAngle: 95, wind: {speed:0, angle:0}, initialPos: {x:0, y:0.11, z:0} });
testShot('RC97 Left 4', { speed: 38, elevation: 13.5, azimuth: 16, spin: 1000, spinAngle: 95, wind: {speed:0, angle:0}, initialPos: {x:0, y:0.11, z:0} });

// CR08
testShot('CR08 Current', { speed: 31.5, elevation: 14.5, azimuth: -1.0, spin: 0, spinAngle: 75, wind: {speed:0, angle:0}, initialPos: {x:1.0, y:0.11, z:7.0} });
testShot('CR08 Tuned 1', { speed: 33.5, elevation: 15.0, azimuth: -1.0, spin: 50, spinAngle: 0, wind: {speed:0, angle:0}, initialPos: {x:1.0, y:0.11, z:7.0} });

// Messi 2019
testShot('Messi19 Tuned', { speed: 28.5, elevation: 18.0, azimuth: 5.5, spin: -650, spinAngle: 85, wind: {speed:0, angle:0}, initialPos: {x:-2.0, y:0.11, z:6.0} });

// Ronaldinho 2002
testShot('R10 Tuned', { speed: 28.0, elevation: 21.0, azimuth: -4.5, spin: 600, spinAngle: 80, wind: {speed:0, angle:0}, initialPos: {x:13.5, y:0.11, z:-3.0} });
