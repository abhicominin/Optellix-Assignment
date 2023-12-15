import * as dat from "lil-gui";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/**
 * GUI Setup
 */
const gui = new dat.GUI({});
const options = {
  "Femur Center": false,
  "Hip Center": false,
  "Femur Proximal Canal": false,
  "Femur Distal Canal": false,
  "Medial Epicondyle": false,
  "Lateral Epicondyle": false,
  "Distal Medial Pt": false,
  "Distal Lateral Pt": false,
  "Posterior Medial Pt": false,
  "Posterior Lateral Pt": false,
};
const optionsGUI = gui.addFolder("Landmark Points");
const controllers = {};

for (const optionName in options) {
  if (options.hasOwnProperty(optionName)) {
    controllers[optionName] = optionsGUI
      .add(options, optionName)
      .name(optionName);
  }
}

// Create folder for update button
const updateFolder = gui.addFolder("Update");
const updateButton = {
  update: () => {
    // Store all landmarks information in an array
    const landmarksInformation = landmarks.map((landmark, index) => {
      return {
        name: landmark.name,
        position: landmark.position.clone(),
      };
    });

    // Log the landmarks information
    console.log(landmarksInformation);

    // Update lines and planes when all landmarks are created
    if (landmarks.length === Object.keys(options).length) {
      updateLines();
      updatePlanes();
    }
  },
};
updateFolder.add(updateButton, "update").name("Update");

// Create folder for Varus slider
const varusFolder = gui.addFolder("Varus/Valgus Slider");
const varusSlider = {
  value: -1,
};
varusFolder
  .add(varusSlider, "value", -10, 10)
  .step(1)
  .name("Varus")
  .onChange(() => {
    rotateVarusValgusPlane();
  });

// Create folder for Flexion slider
const flexionFolder = gui.addFolder("Flexion Slider");
const flexionSlider = {
  value: 1,
};
flexionFolder
  .add(flexionSlider, "value", -10, 10)
  .step(1)
  .name("Flexion")
  .onChange(() => {
    rotateFlexionPlane();
  });

/**
 * Scene Setup
 */
const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();
let landmarks = [];
let lines = [];
let planes = [];
let currentController = null;
let varusValgusPlane;
let flexionPlane;

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

/**
 * Lights
 */
const ambient = new THREE.AmbientLight({ color: 0xffffff }, 0.6);
scene.add(ambient);

const directional = new THREE.DirectionalLight({ color: 0xffffff }, 0.6);
scene.add(directional);

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  10000
);
camera.position.set(0, 400, 0);
scene.add(camera);

/**
 * Controls
 */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.panSpeed = 6;
controls.enableRotate = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0.1);

/**
 * Draco Loader
 */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("draco/");

/**
 * Meshes
 */
let right_Femur;

/**
 * STL Loaders
 */
const femur_loader = new STLLoader();

/**
 * Load Models
 */
const loadModel = (loader, path, color, targetOffsetY, modelName) => {
  loader.load(
    path,
    function (geometry) {
      var material = new THREE.MeshPhysicalMaterial({
        color: color, // Set the color of the material
        metalness: 0.1, // Adjust the metalness property
        roughness: 0.1, // Adjust the roughness property
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      if (modelName === "Right_Femur") {
        right_Femur = mesh;
      }

      const boundingBox = new THREE.Box3().setFromObject(mesh);
      const center = boundingBox.getCenter(new THREE.Vector3());

      camera.position.set(
        center.x,
        center.y + boundingBox.getSize().y,
        center.z
      );
      controls.target.set(center.x, center.y + targetOffsetY, center.z);
    },
    (xhr) => {
      console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (error) => {
      console.log(error);
    }
  );
};

loadModel(femur_loader, "Right_Femur.stl", 0xe3dac9, -100, "Right_Femur");

/**
 * Landmark Creation
 */
const createLandmark = (position, color, landmarkName) => {
  const geometry = new THREE.SphereGeometry(2, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0xf05941 });
  const landmark = new THREE.Mesh(geometry, material);
  landmark.position.copy(position);

  scene.add(landmark);

  // Ensure that the landmarks array is properly initialized before accessing its elements
  landmarks.push({ name: landmarkName, position: landmark.position.clone() });

  if (currentController) {
    currentController.setValue(false);
    currentController = null;
  }
};

/**
 * Line Creation
 */
const createLine = (startLandmark, endLandmark, lineName) => {
  const material = new THREE.LineBasicMaterial({
    color: 0x000000,
    depthTest: false,
    linewidth: 3,
  });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    startLandmark.position,
    endLandmark.position,
  ]);
  const line = new THREE.Line(geometry, material);

  scene.add(line);

  lines.push({
    name: lineName,
    points: [startLandmark.position.clone(), endLandmark.position.clone()],
  });
  console.log(lines);
};

/**
 * Plane Creation
 */
const createPlane = (femurCenter, direction, normal) => {
  // Plane geometry
  const planeGeometry = new THREE.PlaneGeometry(300, 300, 1, 1);

  // Align the plane with the direction and set its position
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction
      )
    )
  );
  planeGeometry.applyMatrix4(matrix);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
  }); // Adjust color and opacity as needed
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);

  // Set the position of the plane
  plane.position.copy(femurCenter.position);

  scene.add(plane);

  planes.push({
    name: "Mechanical Axis Plane",
    plane: plane,
    points: [femurCenter.position.clone()],
  });

  // Projected Line
  // Anterior line
  const newmaterial = new THREE.LineBasicMaterial({
    color: 0xfb8b24,
    depthTest: false,
    linewidth: 2,
  });
  const newgeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(
      landmarks[4].position.x,
      landmarks[4].position.y,
      planes[0].plane.position.z
    ),
    new THREE.Vector3(
      landmarks[5].position.x,
      landmarks[5].position.y,
      planes[0].plane.position.z
    ),
  ]);
  const newline = new THREE.Line(newgeometry, newmaterial);
  lines.push({
    name: "Projected Line",
    points: [
      new THREE.Vector3(
        landmarks[4].position.x,
        landmarks[4].position.y,
        planes[0].plane.position.z
      ),
      new THREE.Vector3(
        landmarks[5].position.x,
        landmarks[5].position.y,
        planes[0].plane.position.z
      ),
    ],
  });

  console.log(lines);
  scene.add(newline);

  const pspheregeometryone = new THREE.SphereGeometry(2, 32, 32);
  const pspherematerialone = new THREE.MeshBasicMaterial({
    color: 0xfb8b24,
    depthTest: false,
  });
  const plandmarkone = new THREE.Mesh(pspheregeometryone, pspherematerialone);
  plandmarkone.position.copy(
    new THREE.Vector3(
      landmarks[4].position.x,
      landmarks[4].position.y,
      planes[0].plane.position.z
    )
  );
  scene.add(plandmarkone);

  const pspheregeometrytwo = new THREE.SphereGeometry(2, 32, 32);
  const pspherematerialtwo = new THREE.MeshBasicMaterial({
    color: 0xfb8b24,
    depthTest: false,
  });
  const plandmarktwo = new THREE.Mesh(pspheregeometrytwo, pspherematerialtwo);
  plandmarktwo.position.copy(
    new THREE.Vector3(
      landmarks[5].position.x,
      landmarks[5].position.y,
      planes[0].plane.position.z
    )
  );
  scene.add(plandmarktwo);

  createAnterior(
    landmarks.find((landmark) => landmark.name === "Femur Center").position
  );

  // Create Varus/Valgus Plane as a duplicate of the existing plane
  duplicateVarusValgusPlane(plane, femurCenter, direction, normal);

  // Create Flexion Plane as a duplicate of the existing plane
  duplicateFlexionPlane(plane, femurCenter, direction, normal);
};

// Function to duplicate Varus/Valgus Plane
const duplicateVarusValgusPlane = (
  originalPlane,
  femurCenter,
  direction,
  normal
) => {
  // Clone the existing plane
  const duplicatedPlane = originalPlane.clone();
  duplicatedPlane.name = "Varus/Valgus Plane";
  duplicatedPlane.material = new THREE.MeshBasicMaterial({
    color: 0x9eb8d9,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
  });

  // Align the duplicated plane with the direction and set its position
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction
      )
    )
  );
  duplicatedPlane.geometry.applyMatrix4(matrix);

  // Set the position of the duplicated plane
  duplicatedPlane.position.copy(femurCenter.position);

  // Add the duplicated plane to the scene
  scene.add(duplicatedPlane);

  planes.push({
    name: "Varus/Valgus Plane",
    plane: duplicatedPlane,
    points: [femurCenter.position.clone()],
  });

  // Store the duplicated plane globally for later access
  varusValgusPlane = duplicatedPlane;
};

// Function to duplicate Flexion Plane
const duplicateFlexionPlane = (
  originalPlane,
  femurCenter,
  direction,
  normal
) => {
  // Clone the existing plane
  const duplicatedPlane = originalPlane.clone();
  duplicatedPlane.name = "Flexion Plane";
  duplicatedPlane.material = new THREE.MeshBasicMaterial({
    color: 0xffb534,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
  });

  // Align the duplicated plane with the direction and set its position
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction
      )
    )
  );
  duplicatedPlane.geometry.applyMatrix4(matrix);

  // Set the position of the duplicated plane
  duplicatedPlane.position.copy(femurCenter.position);

  // Add the duplicated plane to the scene
  scene.add(duplicatedPlane);

  planes.push({
    name: "Flexion Plane",
    plane: duplicatedPlane,
    points: [femurCenter.position.clone()],
  });

  // Store the duplicated plane globally for later access
  flexionPlane = duplicatedPlane;

  // Creating Distal Plane
  distalPlane();
};

// Function to rotate Varus/Valgus Plane about the anterior line
const rotateVarusValgusPlane = () => {
  if (varusValgusPlane) {
    const anteriorLine = lines.find((line) => line.name === "Anterior Line");

    if (anteriorLine) {
      const normal = new THREE.Vector3()
        .subVectors(anteriorLine.points[1], anteriorLine.points[0])
        .normalize();
      const rotationAmount = THREE.MathUtils.degToRad(varusSlider.value); // Convert degrees to radians

      varusValgusPlane.setRotationFromAxisAngle(normal, rotationAmount);
    }
  }
};

// Function to create a line perpendicular to the anterior line
const createPerpendicularLine = (startPoint, direction, length, color) => {
  const endPoint = new THREE.Vector3()
    .copy(startPoint)
    .addScaledVector(direction, length);

  const material = new THREE.LineBasicMaterial({
    color: color,
    depthTest: false,
    linewidth: 2,
  });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    startPoint,
    endPoint,
  ]);
  const line = new THREE.Line(geometry, material);

  scene.add(line);

  // Store the perpendicular line information in the lines array
  lines.push({
    name: "Perpendicular Line",
    points: [startPoint.clone(), endPoint.clone()],
  });
};

// Creating the anterior line
const createAnterior = (hipPosition) => {
  const anteriorLineLength = 10; // Length of the anterior line in mm

  // Calculate the direction vector of the projected line
  const projectedLineDirection = new THREE.Vector3()
    .subVectors(landmarks[5].position, landmarks[4].position)
    .normalize();

  // Calculate the perpendicular vector to the projected line
  const perpendicularVector = new THREE.Vector3(
    -projectedLineDirection.y,
    projectedLineDirection.x,
    0
  ).normalize();

  // Calculate the endpoint of the anterior line
  const anteriorLineEndpoint = new THREE.Vector3()
    .copy(hipPosition)
    .addScaledVector(perpendicularVector, anteriorLineLength);

  // Create the anterior line
  const anteriorMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    depthTest: false,
  });
  const anteriorGeometry = new THREE.BufferGeometry().setFromPoints([
    hipPosition,
    anteriorLineEndpoint,
  ]);
  const anteriorLine = new THREE.Line(anteriorGeometry, anteriorMaterial);

  // Add the anterior line to the scene
  scene.add(anteriorLine);

  // Store the anterior line information in the lines array
  lines.push({
    name: "Anterior Line",
    points: [hipPosition.clone(), anteriorLineEndpoint.clone()],
  });
  console.log(lines);

  // line perpendicular to anterior line
  createPerpendicularLine(hipPosition, projectedLineDirection, 10, 0x00ffff);
};

// Function to rotate Flexion Plane about the anterior line
const rotateFlexionPlane = () => {
  if (flexionPlane) {
    const perpendicularLine = lines.find(
      (line) => line.name === "Perpendicular Line"
    );

    if (perpendicularLine) {
      const normal = new THREE.Vector3()
        .subVectors(perpendicularLine.points[1], perpendicularLine.points[0])
        .normalize();
      const rotationAmount = THREE.MathUtils.degToRad(flexionSlider.value); // Convert degrees to radians

      flexionPlane.setRotationFromAxisAngle(normal, rotationAmount);
    }
  }
};

// Function to create a distal medial plane
const distalPlane = () => {
  if (flexionPlane) {
    const distalMedialPt = landmarks.find(
      (landmark) => landmark.name === "Distal Medial Pt"
    );

    if (distalMedialPt) {
      // Clone the flexion plane to create the distal medial plane
      const distalMedialPlane = flexionPlane.clone();
      distalMedialPlane.name = "Distal Medial Plane";
      distalMedialPlane.material = new THREE.MeshBasicMaterial({
        color: 0xff5733,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });

      // Set the position of the distal medial plane to the distal medial point
      distalMedialPlane.position.copy(distalMedialPt.position);

      // Add the distal medial plane to the scene
      scene.add(distalMedialPlane);

      // Store the distal medial plane globally for later access
      planes.push({
        name: "Distal Medial Plane",
        plane: distalMedialPlane,
        points: [distalMedialPt.position.clone()],
      });

      // Projected Line for Distal Medial Plane
      const newmaterial = new THREE.LineBasicMaterial({
        color: 0xff5733,
        depthTest: false,
        linewidth: 2,
      });
      const newgeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          distalMedialPt.position.x,
          distalMedialPt.position.y,
          flexionPlane.position.z
        ),
        new THREE.Vector3(
          distalMedialPt.position.x,
          distalMedialPt.position.y,
          flexionPlane.position.z - 10
        ),
      ]);
      const newline = new THREE.Line(newgeometry, newmaterial);
      lines.push({
        name: "Projected Distal Medial Line",
        points: [
          new THREE.Vector3(
            distalMedialPt.position.x,
            distalMedialPt.position.y,
            flexionPlane.position.z
          ),
          new THREE.Vector3(
            distalMedialPt.position.x,
            distalMedialPt.position.y,
            flexionPlane.position.z - 10
          ),
        ],
      });
      scene.add(newline);

      console.log(lines);

      // Call the function to create Distal Resection Plane
      distalResectionPlane();
    }
  }
};

// Function to create Distal Resection Plane
const distalResectionPlane = () => {
  if (flexionPlane) {
    const distalMedialPt = landmarks.find(
      (landmark) => landmark.name === "Distal Medial Pt"
    );

    if (distalMedialPt) {
      // Create a new plane parallel to the Distal Medial Plane and 10mm back
      const distalResectionPlane = flexionPlane.clone();
      distalResectionPlane.name = "Distal Resection Plane";
      distalResectionPlane.material = new THREE.MeshBasicMaterial({
        color: 0x8b4513,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });

      // Move the plane 10mm back
      const backDirection = new THREE.Vector3(0, 0, -1); // Adjust the direction as needed
      distalResectionPlane.position
        .copy(distalMedialPt.position)
        .addScaledVector(backDirection, 10);

      // Add the Distal Resection Plane to the scene
      scene.add(distalResectionPlane);

      // Store the Distal Resection Plane globally for later access
      planes.push({
        name: "Distal Resection Plane",
        plane: distalResectionPlane,
        points: [distalMedialPt.position.clone()],
      });

      // Projected Line for Distal Resection Plane
      const newmaterial = new THREE.LineBasicMaterial({
        color: 0x8b4513,
        depthTest: false,
        linewidth: 2,
      });
      const newgeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          distalMedialPt.position.x,
          distalMedialPt.position.y,
          distalResectionPlane.position.z
        ),
        new THREE.Vector3(
          distalMedialPt.position.x,
          distalMedialPt.position.y,
          distalResectionPlane.position.z - 10
        ),
      ]);
      const newline = new THREE.Line(newgeometry, newmaterial);
      lines.push({
        name: "Projected Distal Resection Line",
        points: [
          new THREE.Vector3(
            distalMedialPt.position.x,
            distalMedialPt.position.y,
            distalResectionPlane.position.z
          ),
          new THREE.Vector3(
            distalMedialPt.position.x,
            distalMedialPt.position.y,
            distalResectionPlane.position.z - 10
          ),
        ],
      });
      scene.add(newline);

      console.log(lines);
    }
  }
};

/**
 * Update Lines
 */
const updateLines = () => {
  createLine(landmarks[0], landmarks[1], "Mechanical Axis");
  createLine(landmarks[2], landmarks[3], "Anatomical Axis");
  createLine(landmarks[4], landmarks[5], "TEA-Trans epicondyle Axis");
  createLine(landmarks[8], landmarks[9], "PCA- Posterior Condyle Axis");

  // Update planes when all landmarks are created
  if (landmarks.length === Object.keys(options).length) {
    updatePlanes();
  }
};

/**
 * Update Planes
 */
const updatePlanes = () => {
  if (landmarks.length >= 2) {
    const femurCenter = landmarks.find(
      (landmark) => landmark.name === "Femur Center"
    );
    const hipCenter = landmarks.find(
      (landmark) => landmark.name === "Hip Center"
    );

    if (femurCenter && hipCenter) {
      // Vector representing the direction of the line (Mechanical Axis)
      const direction = new THREE.Vector3()
        .subVectors(hipCenter.position, femurCenter.position)
        .normalize();

      // Vector representing the normal to the plane (perpendicular to the line)
      const normal = new THREE.Vector3(1, 0, 0); // Change the normal vector as needed

      createPlane(femurCenter, direction, normal);
    }
  }
};

/**
 * Controller Change Handler
 */
const handleControllerChange = (value, controller) => {
  if (value) {
    // Disable existing controls
    if (currentController) {
      currentController.setValue(false);
      currentController = null;
    }

    currentController = controller;

    // Create controls based on the selected landmark
    if (currentController) {
      const activeLandmark = landmarks.find(
        (landmark) => landmark.name === currentController.property
      );

      if (activeLandmark) {
        const { position, name } = activeLandmark;
        console.log(`Clicked on landmark: ${name}`);
      }

      // Update lines and planes when all landmarks are created
      if (landmarks.length === Object.keys(options).length) {
        updateLines();
        updatePlanes();
      }
    }
  }
};

/**
 * Mouse Click Handler
 */
window.addEventListener("click", (event) => {
  if (currentController) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    mouse.x = (event.clientX / sizes.width) * 2 - 1;
    mouse.y = -(event.clientY / sizes.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersections = raycaster.intersectObjects([right_Femur], true);
    if (intersections.length > 0) {
      const newPosition = intersections[0].point;
      const activeLandmarkName = currentController.property;
      createLandmark(newPosition, 0xff0000, activeLandmarkName);
    }
  }
});

/**
 * Enable Transformation Controls for Landmarks
 */
for (const controllerName in controllers) {
  if (controllers.hasOwnProperty(controllerName)) {
    controllers[controllerName].onChange((value) =>
      handleControllerChange(value, controllers[controllerName])
    );
  }
}

/**
 * Animation Loop
 */
const clock = new THREE.Clock();

const animate = () => {
  const elapsedTime = clock.getElapsedTime();

  controls.update();

  renderer.render(scene, camera);

  requestAnimationFrame(animate);
};

/**
 * Handle Resizing
 */
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Start the animation loop
animate();
