import axios from 'axios';

const client = axios.create({ baseURL: '/api' });

export async function listModels() {
  const { data } = await client.get('/models');
  return data;
}

export async function uploadModel(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/models/upload', form);
  return data;
}

export async function listTextures() {
  const { data } = await client.get('/textures');
  return data;
}

export async function uploadTexture(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/textures/upload', form);
  return data;
}

export async function saveDesign(design) {
  const { data } = await client.post('/designs', design);
  return data;
}

export async function listDesigns() {
  const { data } = await client.get('/designs');
  return data;
}

export async function loadDesign(id) {
  const { data } = await client.get(`/designs/${encodeURIComponent(id)}`);
  return data;
}
