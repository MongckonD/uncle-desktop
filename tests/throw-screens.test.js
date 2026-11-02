const test = require('node:test');
const assert = require('node:assert/strict');

test('a throw crosses an open edge and bounces off a closed edge', async () => {
  global.matchMedia ||= () => ({ matches: false, addEventListener() {} });
  const { Capri } = await import('../src/renderer/js/capri.js');
  const make = () => {
    const c = Object.create(Capri.prototype);
    c.view = { w: 1000, h: 1000, floor: 1000 };
    c.flight = { kind: 'throw', c: { x: 1040, y: 300 }, v: { x: 1000, y: 0 }, a: 0, w: 0, last: 0, freezeUntil: 0, release: 0, frame: 0, phase: 'air', hits: 0, hard: 0 };
    c.reachAt = () => ({ minX: -50, maxX: 50, minY: -50, maxY: 50, low: 0 });
    c.impact = () => {};
    c.ledgeUnder = () => null;
    c.setMid = () => {};
    c.place = () => {};
    return c;
  };
  const open = make();
  open.canCross = () => true;
  open.crossOver = side => { open.crossed = side; };
  open.updateFly(50);
  assert.equal(open.crossed, 1);
  const closed = make();
  closed.canCross = () => false;
  closed.updateFly(50);
  assert.ok(closed.flight.v.x < 0);
  assert.equal(closed.flight.c.x, 950);
});

test('a hard edge impact completes and reverses velocity instead of repeating effects', async () => {
  global.matchMedia ||= () => ({ matches: false, addEventListener() {} });
  global.requestAnimationFrame ||= () => {};
  const { Capri } = await import('../src/renderer/js/capri.js');
  const c = Object.create(Capri.prototype);
  c.view = { w: 1000, h: 1000, floor: 1000 };
  c.scale = 1;
  c.flight = { kind: 'throw', c: { x: 940, y: 400 }, v: { x: 3500, y: 0 }, a: 0, w: 0, last: 0, freezeUntil: 0, release: 0, frame: 0, phase: 'air', hits: 0, hard: 0 };
  c.reachAt = () => ({ minX: -50, maxX: 50, minY: -50, maxY: 50, low: 0 });
  c.canCross = () => false;
  c.flat = () => ({ x: 950, y: 400 });
  c.voice = { play() {} };
  let lines = 0;
  c.fx = { ring() {}, burst() {}, crack() {}, lines() { lines++; } };
  c.p = {};
  c.drawFrame = () => {};
  c.setMid = () => {};
  c.place = () => {};
  c.ledgeUnder = () => null;
  c.updateFly(50);
  assert.ok(c.flight.v.x < 0, 'the hard collision must reverse horizontal velocity');
  assert.equal(lines, 1, 'the impact effect should start once');
});
