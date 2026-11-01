const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let predictions = [0.1, 0.1, 0.7];
  let loads = 0;
  let failLoad = false;
  let failClassify = false;
  const revoked = [];
  class File {}
  class Image {
    complete = true;
    naturalWidth = 100;
  }
  const model = { classify: async () => {
    if (failClassify) throw new Error('inference failed');
    return ['Porn', 'Hentai', 'Sexy', 'Neutral', 'Drawing'].map((className, i) => ({ className, probability: predictions[i] ?? 0 }));
  }};
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/utils/imageModerator.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, File, Image,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) },
    console: { warn() {} },
    require: name => {
      if (name === '@tensorflow/tfjs') return {};
      if (name === 'nsfwjs') return { load: async () => { loads++; if (failLoad) throw new Error('network failed'); return model; } };
      throw new Error(name);
    },
  });
  return { api: module.exports, File, revoked,
    setPredictions: value => { predictions = value; },
    setFailLoad: value => { failLoad = value; },
    setFailClassify: value => { failClassify = value; },
    get loads() { return loads; },
  };
}

test('roupas: não soma classes; respeita limiares individuais e fronteiras', async () => {
  const h = harness();
  assert.equal(h.loads, 0);
  for (const [scores, safe] of [
    [[0.2, 0.2, 0.6], true], [[0.1, 0.1, 0.7], true],
    [[0.6, 0.1, 0.1], true], [[0.1, 0.6, 0.1], true],
    [[0.05, 0.05, 0.85], true], [[0.61, 0.1, 0.1], false],
    [[0.1, 0.61, 0.1], false], [[0.05, 0.05, 0.86], false],
  ]) {
    h.setPredictions(scores);
    assert.equal((await h.api.moderateImage('data:image/png;base64,test')).isSafe, safe);
  }
  assert.equal(h.loads, 1);
});

test('modelo carregado uma vez em chamadas concorrentes e URL liberada', async () => {
  const h = harness();
  await Promise.all([h.api.moderateImage(new h.File()), h.api.moderateImage(new h.File())]);
  assert.equal(h.loads, 1);
  assert.deepEqual(h.revoked, ['blob:test', 'blob:test']);
});

test('falha de rede propaga erro, libera URL e permite nova tentativa', async () => {
  const h = harness();
  h.setFailLoad(true);
  await assert.rejects(h.api.moderateImage(new h.File()), /network failed/);
  assert.equal(h.revoked.length, 1);
  h.setFailLoad(false);
  await h.api.moderateImage(new h.File());
  assert.equal(h.loads, 2);
});

test('falha de inferência e resultado inválido impedem aprovação', async () => {
  const h = harness();
  h.setFailClassify(true);
  await assert.rejects(h.api.moderateImage(new h.File()), /inference failed/);
  h.setFailClassify(false);
  h.setPredictions([NaN, 0, 0]);
  await assert.rejects(h.api.moderateImage(new h.File()), /inválido/);
  assert.equal(h.revoked.length, 2);
});
