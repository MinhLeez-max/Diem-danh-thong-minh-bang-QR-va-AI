/** Register browser/CPU inference backends only when counting is requested. */
export async function initializePeopleBackend() {
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  return tf;
}

export async function loadPeopleModel() {
  await initializePeopleBackend();
  const cocoSsd = await import('@tensorflow-models/coco-ssd');
  return cocoSsd.load({ base: 'mobilenet_v2' });
}
