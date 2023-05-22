struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
};

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cellColor: vec4f,
};

@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellState: array<i32>;

const targetStepsPerSec = 60.0;
const decay = 10.0 * targetStepsPerSec;

fn hsv2rgb(c: vec3f) -> vec3f
{
    let K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput  {
    let i = f32(input.instance);
    let cell = vec2f(i % grid.x, floor(i / grid.x));
    let state = f32(cellState[input.instance]);

    let cellOffset = cell / grid * 2;
    let gridPos = (input.pos + 1) / grid - 1 + cellOffset;

    let c = cell / grid;
    var color = vec4(vec3(0.2), 1.0); // never was alive
    if (state > 0.5) {
        // alive
        //let fade = max(0.0, 1.0 - state / decay);
        //color = vec4f(fade * 0.7, 1.0, 0.0, 1.0);
        color = vec4f(1.0);
    } else if (state < -44.0 * targetStepsPerSec) {
        // Zombie rebirth foreshadowing
        color = vec4f((state / -targetStepsPerSec) - 44.0, 0.2, 0.2, 1.0);
    } else if (state < -0.5) {
        // was alive, then died
        let fade = max(0.0, 1.0 + state / decay);
        //color = vec4f(fade * 0.7 + 0.2, fade * 0.2 + 0.2, 0.2, 1.0);
        //color = vec4f(0.2 + hsv2rgb(vec3(state / (4.0 * targetStepsPerSec), 0.8, fade * 0.8)), 1.0);
        color = vec4f(fade * 0.1 + 0.2, fade * 0.4 + 0.2, fade * 0.8 + 0.2, 1.0);
    }

    var output: VertexOutput;
    output.pos = vec4f(gridPos, 0, 1);
    output.cellColor = color;
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return input.cellColor;
}
