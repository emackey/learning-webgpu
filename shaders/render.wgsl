struct VertexInput {
    @location(0) pos: vec2f,
};

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cell: vec2f,
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

fn cellIndex(cell: vec2f) -> u32 {
    return (u32(cell.y) % u32(grid.y)) * u32(grid.x) +
        (u32(cell.x) % u32(grid.x));
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput  {
    let cell = (input.pos * 0.5 + 0.5) * grid;

    var output: VertexOutput;
    output.pos = vec4f(input.pos, 0, 1);
    output.cell = cell;
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let state = f32(cellState[cellIndex(input.cell)]);

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

    return color;
}
