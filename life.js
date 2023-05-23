const breederImage = new Image();
//breederImage.src = 'reference/Breeder_mono.png';
breederImage.src = 'reference/MiniPoof_mono.png';
await new Promise(resolve => {
    breederImage.addEventListener("load", resolve);
});
const breederCanvas = document.createElement('canvas');
const breederWidth = breederImage.width;
const breederHeight = breederImage.height;
breederCanvas.width = breederWidth;
breederCanvas.height = breederHeight;
const breederContext = breederCanvas.getContext('2d');
breederContext.drawImage(breederImage, 0, 0);
const breederData = breederContext.getImageData(0, 0, breederWidth, breederHeight);

const canvas = document.querySelector("canvas");

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});

// Max grid size is 5792 (limited by binding size: squared, * 4 bytes per cell)
// Max binding size is 134217728.
const GRID_SIZE = 512;
const GLIDERS_PER_SIDE = GRID_SIZE / 16;

// Create a uniform buffer that describes the grid.
const gridUniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const gridUniformBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: gridUniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(gridUniformBuffer, 0, gridUniformArray);

// Create an array representing the active state of each cell.
const cellStateArray = new Int32Array(GRID_SIZE * GRID_SIZE);

// Create two storage buffers to hold the cell state.
const cellStateStorage = [
    device.createBuffer({
        label: "Cell State A",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
        label: "Cell State B",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
];

// Set each cell to a random state, then copy the JavaScript array
// into the storage buffer.
/*
for (let i = 0; i < cellStateArray.length; ++i) {
    cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
*/

if (GRID_SIZE < 512) {
    // Bottom row
    for(let i = 0; i < GLIDERS_PER_SIDE; ++i) {
        let x = Math.floor(Math.random() * (GRID_SIZE - 7)) + 4;
        let y = 1;
        let pos = y * GRID_SIZE + x;
        // ***
        // ..*  up and to the right
        // .*.
        cellStateArray[2 * GRID_SIZE + 0 + pos] = 1;
        cellStateArray[2 * GRID_SIZE + 1 + pos] = 1;
        cellStateArray[2 * GRID_SIZE + 2 + pos] = 1;
        cellStateArray[1 * GRID_SIZE + 2 + pos] = 1;
        cellStateArray[1 + pos] = 1;
    }
    // Right side
    for(let i = 0; i < GLIDERS_PER_SIDE; ++i) {
        let y = Math.floor(Math.random() * (GRID_SIZE - 7)) + 4;
        let x = GRID_SIZE - 4;
        let pos = y * GRID_SIZE + x;
        // **.
        // *.*  up and to the left
        // *..
        cellStateArray[2 * GRID_SIZE + 0 + pos] = 1;
        cellStateArray[2 * GRID_SIZE + 1 + pos] = 1;
        cellStateArray[1 * GRID_SIZE + 0 + pos] = 1;
        cellStateArray[1 * GRID_SIZE + 2 + pos] = 1;
        cellStateArray[0 + pos] = 1;
    }
    // Top row
    for(let i = 0; i < GLIDERS_PER_SIDE; ++i) {
        let x = Math.floor(Math.random() * (GRID_SIZE - 7)) + 4;
        let y = GRID_SIZE - 4;
        let pos = y * GRID_SIZE + x;
        // .*.
        // *..  down and to the left
        // ***
        cellStateArray[2 * GRID_SIZE + 1 + pos] = 1;
        cellStateArray[1 * GRID_SIZE + 0 + pos] = 1;
        cellStateArray[0 + pos] = 1;
        cellStateArray[1 + pos] = 1;
        cellStateArray[2 + pos] = 1;
    }
    // Left side
    for(let i = 0; i < GLIDERS_PER_SIDE; ++i) {
        let y = Math.floor(Math.random() * (GRID_SIZE - 7)) + 4;
        let x = 1;
        let pos = y * GRID_SIZE + x;
        // ..*
        // *.*  down and to the right
        // .**
        cellStateArray[2 * GRID_SIZE + 2 + pos] = 1;
        cellStateArray[1 * GRID_SIZE + 0 + pos] = 1;
        cellStateArray[1 * GRID_SIZE + 2 + pos] = 1;
        cellStateArray[1 + pos] = 1;
        cellStateArray[2 + pos] = 1;
    }
} else {
    // Big grids get a breeder
    const startY = Math.floor((GRID_SIZE / 2) + (breederImage.height / 2));
    for (let y = 0; y < breederHeight; ++y) {
        for (let x = 0; x < breederWidth; ++x) {
            const rgbPos = (y * breederWidth + x) * 4;
            const gridPos = (GRID_SIZE * (startY - y)) + x;
            cellStateArray[gridPos] = breederData.data[rgbPos] > 128 ? 1 : 0;
        }
    }
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

const vertices = new Float32Array([
    //   X,    Y,
    -1, -1, // Lower-right triangle
    1, -1,
    1, 1,

    -1, -1, // Upper-left triangle
    1, 1,
    -1, 1,
]);

const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

const vertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
    }],
};

const shaderRenderResponse = await fetch("shaders/render.wgsl");
let shaderRenderText = await shaderRenderResponse.text();
const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: shaderRenderText
});

const WORKGROUP_SIZE = 8;

// Create the compute shader that will process the simulation.
const shaderComputeResponse = await fetch("shaders/compute.wgsl");
let shaderComputeText = await shaderComputeResponse.text();
shaderComputeText = shaderComputeText.replaceAll("${WORKGROUP_SIZE}",
    WORKGROUP_SIZE.toString());
const simulationShaderModule = device.createShaderModule({
    label: "Game of Life simulation shader",
    code: shaderComputeText
});

// Create the bind group layout and pipeline layout.
const bindGroupLayout = device.createBindGroupLayout({
    label: "Cell Bind Group Layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: {} // Grid uniform buffer
    }, {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" } // Cell state input buffer
    }, {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" } // Cell state output buffer
    }]
});

// Create a bind group to pass the grid uniforms into the pipeline
const bindGroups = [
    device.createBindGroup({
        label: "Cell renderer bind group A",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: gridUniformBuffer }
        }, {
            binding: 1,
            resource: { buffer: cellStateStorage[0] }
        }, {
            binding: 2,
            resource: { buffer: cellStateStorage[1] }
        }],
    }),
    device.createBindGroup({
        label: "Cell renderer bind group B",
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: gridUniformBuffer }
        }, {
            binding: 1,
            resource: { buffer: cellStateStorage[1] }
        }, {
            binding: 2,
            resource: { buffer: cellStateStorage[0] }
        }],
    })
];

const pipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [bindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: pipelineLayout,
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [{
            format: canvasFormat
        }]
    }
});

// Create a compute pipeline that updates the game state.
const simulationPipeline = device.createComputePipeline({
    label: "Simulation pipeline",
    layout: pipelineLayout,
    compute: {
        module: simulationShaderModule,
        entryPoint: "computeMain",
    }
});

let step = 0; // Track how many simulation steps have been run
let swap = false;
let turbo = false;

addEventListener('keydown', e => {
    if (e.key == 'Shift') {
        turbo = true;
    }
});
addEventListener('keyup', e => {
    if (e.key == 'Shift') {
        turbo = false;
    }
});

const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);

function updateGrid() {
    requestAnimationFrame(updateGrid);

    // Start a render pass
    const encoder = device.createCommandEncoder();

    const stepsToTake = turbo ? 25 : 1;
    for (let s = 0; s < stepsToTake; ++s) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(simulationPipeline),
        computePass.setBindGroup(0, bindGroups[swap ? 1 : 0]);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
        computePass.end();

        step++; // Increment the step count
        swap = !swap;
    }

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: [0, 0, 0.4, 1],
            storeOp: "store",
        }]
    });

    // Draw the grid.
    pass.setPipeline(cellPipeline);
    pass.setBindGroup(0, bindGroups[swap ? 1 : 0]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2); // 6 vertices

    pass.end();
    device.queue.submit([encoder.finish()]);
}

// Schedule updateGrid() to run repeatedly
requestAnimationFrame(updateGrid);
