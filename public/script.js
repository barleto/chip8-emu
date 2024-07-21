"use strict";
const chip8 = new Chip8();
document.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
        chip8.step();
    }, 1);
});
