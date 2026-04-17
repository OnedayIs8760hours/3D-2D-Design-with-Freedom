import axios, { type AxiosResponse } from 'axios';

const client = axios.create({ baseURL: '/api' });

export async function listModels(): Promise<any> {
  const { data }: AxiosResponse = await client.get('/models');
  return data;
}

export async function uploadModel(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const { data }: AxiosResponse = await client.post('/models/upload', form);
  return data;
}

export async function listTextures(): Promise<any> {
  const { data }: AxiosResponse = await client.get('/textures');
  return data;
}

export async function uploadTexture(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const { data }: AxiosResponse = await client.post('/textures/upload', form);
  return data;
}

export async function saveDesign(design: Record<string, any>): Promise<any> {
  const { data }: AxiosResponse = await client.post('/designs', design);
  return data;
}

export async function listDesigns(): Promise<any> {
  const { data }: AxiosResponse = await client.get('/designs');
  return data;
}

export async function loadDesign(id: string): Promise<any> {
  const { data }: AxiosResponse = await client.get(`/designs/${encodeURIComponent(id)}`);
  return data;
}
