"use strict";
/**
 * Screen size is 64Wx32H.
 * Specification: https://www.cs.columbia.edu/~sedwards/classes/2016/4840-spring/designs/Chip8.pdf
 */
class Chip8 {
    constructor() {
        this._cpu = new CPU();
    }
}
class CPU {
    constructor() {
        this.registers = {
            V0: 0, V1: 0, V2: 0, V3: 0, V4: 0, V5: 0, V6: 0, V7: 0, V8: 0, V9: 0, VA: 0, VB: 0, VC: 0, VD: 0, VE: 0, VF: 0, SP: 0, //8bit
            IDX: 0, PC: CPU.START_MEM_LOC, // 16bit
            clockT: 0
        };
        this.delayTimer = new Timer(); //8bit
        this.soundTimer = new Timer(); //8bit
        this.reset();
    }
    reset() {
        this.registers = {
            V0: 0, V1: 0, V2: 0, V3: 0, V4: 0, V5: 0, V6: 0, V7: 0, V8: 0, V9: 0, VA: 0, VB: 0, VC: 0, VD: 0, VE: 0, VF: 0, SP: 0,
            IDX: 0, PC: CPU.START_MEM_LOC,
            clockT: 0,
        };
        this.mem = new Memory();
        this.frameBuff = new FrameBuffer();
        this.stack = new Stack();
    }
}
CPU.START_MEM_LOC = 0x200;
class Stack {
    constructor(size = 64) {
        this.stack = [];
    }
    reset() {
        this.stack = [];
    }
}
class Memory {
    constructor() {
        this.mem = [];
    }
    reset() {
        this.mem = [];
    }
}
Memory.MEM_SIZE = 4096;
class FrameBuffer {
    constructor(width = 64, height = 32) {
        this.width = width;
        this.height = height;
    }
}
class Timer {
    constructor() {
        this.value = 0;
    }
    setValue(newValue) {
        this.value = Math.max(0, Math.min(0xFF, newValue));
    }
    tick() {
        this.value = Math.max(0, this.value - 1);
    }
    isActive() {
        return this.value > 0;
    }
}
