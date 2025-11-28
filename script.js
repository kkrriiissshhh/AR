import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Application State
let points = []; // Stores vector3 positions
let measurementLine = null;
let measureUnit = 'm';
const actionBtn = document.getElementById('action-btn');
const instructionText = document.getElementById('instruction-text');
const startBtn = document.getElementById('start-btn');
const uiDiv = document.getElementById('ar-ui');

// Labels in the UI
const p1Label = document.getElementById('p1-coord');
const p2Label = document.getElementById('p2-coord');
const distLabel = document.getElementById('distance-value');
const unitSelect = document.getElementById('unit-selector');

// --- Initialization ---

init();

function init() {
    // 1. Setup Three.js Scene
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Light so we can see 3D objects
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    scene.add(light);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // IMPORTANT for AR
    document.body.appendChild(renderer.domElement);

    // 2. AR Start Button
    // We attach the AR session logic to our custom button if possible,
    // but standard WebXR requires a specific User Interaction flow.
    // Three.js ARButton manages the "Enter AR" complex logic.
    // We append the hidden ARButton to body and trigger it programmatically via our UI or style it.
    
    // Actually, styling the standard ARButton is easier for cross-browser compat
    const arButtonObj = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
    arButtonObj.style.display = 'none'; 
    document.body.appendChild(arButtonObj);

    startBtn.addEventListener('click', () => {
        // Hide intro, show UI
        document.getElementById('intro-screen').style.display = 'none';
        
        // Trigger the internal VR/AR start
        arButtonObj.click(); 
        
        // Show our AR UI overlay
        uiDiv.style.display = 'block';
    });

    // 3. Controller & Hit Testing
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect); // Tap gesture
    scene.add(controller);

    // Visual Reticle (The white ring)
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Event Listeners for UI
    document.getElementById('reset-btn').addEventListener('click', resetMeasurement);
    unitSelect.addEventListener('change', (e) => {
        measureUnit = e.target.value;
        calculateDistance();
    });

    // Handle Resize
    window.addEventListener('resize', onWindowResize);

    // Render Loop
    renderer.setAnimationLoop(render);
}

// --- Interaction Logic ---

function onSelect() {
    if (reticle.visible) {
        
        if (points.length >= 2) return; // Already measured

        // 1. Create a point marker at reticle position
        const material = new THREE.MeshPhongMaterial({ color: 0x007bff });
        const geometry = new THREE.SphereGeometry(0.02, 16, 16); // 2cm ball
        const mesh = new THREE.Mesh(geometry, material);
        
        // Set position from reticle
        mesh.position.setFromMatrixPosition(reticle.matrix);
        scene.add(mesh);
        
        points.push({ mesh: mesh, vec: mesh.position.clone() });

        // Update UI
        updateUIState();
    }
}

function updateUIState() {
    if (points.length === 1) {
        // Point 1 Set
        actionBtn.innerText = "Set Point 2";
        instructionText.innerText = "Move camera to target. Tap 'Set Point 2'.";
        p1Label.innerText = formatCoord(points[0].vec);
        actionBtn.onclick = () => onSelect(); // Link button to action
    } else if (points.length === 2) {
        // Point 2 Set
        actionBtn.innerText = "Complete";
        actionBtn.disabled = true;
        actionBtn.style.opacity = 0.5;
        instructionText.innerText = "Measurement Complete.";
        p2Label.innerText = formatCoord(points[1].vec);
        
        // Draw the line
        drawLine();
        calculateDistance();
    }
}

// Just trigger onSelect when the HTML button is pressed too
actionBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent triggering double taps if inputs overlap
    onSelect();
});

// --- visual Helpers ---

function drawLine() {
    if (points.length < 2) return;

    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 5 });
    const pointsArray = [points[0].vec, points[1].vec];
    const geometry = new THREE.BufferGeometry().setFromPoints(pointsArray);

    measurementLine = new THREE.Line(geometry, material);
    scene.add(measurementLine);
}

function calculateDistance() {
    if (points.length < 2) {
        distLabel.innerText = "0.00";
        return;
    }

    // Distance in Meters (default GL units)
    const distanceMeters = points[0].vec.distanceTo(points[1].vec);
    let displayValue = 0;

    switch (measureUnit) {
        case 'm': displayValue = distanceMeters; break;
        case 'cm': displayValue = distanceMeters * 100; break;
        case 'in': displayValue = distanceMeters * 39.3701; break;
        case 'ft': displayValue = distanceMeters * 3.28084; break;
    }

    distLabel.innerText = displayValue.toFixed(2);
}

function resetMeasurement() {
    // Remove 3D objects
    points.forEach(p => scene.remove(p.mesh));
    if (measurementLine) scene.remove(measurementLine);

    points = [];
    measurementLine = null;

    // Reset UI
    actionBtn.innerText = "Set Point 1";
    actionBtn.disabled = false;
    actionBtn.style.opacity = 1;
    instructionText.innerText = "Aim at a surface and tap Set Point 1.";
    p1Label.innerText = "---";
    p2Label.innerText = "---";
    distLabel.innerText = "0.00";
}

function formatCoord(vec) {
    return `(${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)})`;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Render Loop (Standard WebXR Pattern) ---

function render(timestamp, frame) {
    if (frame) {
        // 1. Get AR reference space
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // 2. Request Hit Test Source (once)
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });

            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
                // handle session end (e.g. reset UI)
                document.getElementById('intro-screen').style.display = 'flex';
                uiDiv.style.display = 'none';
            });

            hitTestSourceRequested = true;
        }

        // 3. Perform Hit Test
        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0 && points.length < 2) {
                const hit = hitTestResults[0];
                
                // Show reticle and snap to surface
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                
                // Simple instruction logic
                if(points.length === 0) instructionText.innerText = "Surface detected. Tap 'Set Point 1'.";

            } else {
                reticle.visible = false;
                if(points.length < 2) instructionText.innerText = "Aim at floor/wall to detect surface.";
            }
        }
    }

    renderer.render(scene, camera);
}