import { getRedis } from "./redis";

export type UploadJobStatus = "pending" | "processing" | "complete" | "error";

export interface UploadJobProgress {
  stage: "parsing" | "suppliers" | "pos" | "batches" | "queuing" | "complete";
  current: number;
  total: number;
  message: string;
}

export interface UploadJobResult {
  total: number;
  byAction: { CANCEL: number; EXPEDITE: number; PUSH_OUT: number };
  suppliers: { created: number; updated: number };
  batches: { created: number; totalValue: number };
  conflicts: number;
  skipped: number;
}

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  progress: UploadJobProgress;
  result?: UploadJobResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const JOB_PREFIX = "upload:job:";
const JOB_TTL = 3600; // 1 hour

export async function createUploadJob(): Promise<string> {
  const redis = getRedis();
  const jobId = crypto.randomUUID();

  const job: UploadJob = {
    id: jobId,
    status: "pending",
    progress: {
      stage: "parsing",
      current: 0,
      total: 0,
      message: "Starting upload...",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await redis.setex(`${JOB_PREFIX}${jobId}`, JOB_TTL, JSON.stringify(job));
  return jobId;
}

export async function getUploadJob(jobId: string): Promise<UploadJob | null> {
  const redis = getRedis();
  const data = await redis.get(`${JOB_PREFIX}${jobId}`);
  return data ? JSON.parse(data) : null;
}

export async function updateJobProgress(
  jobId: string,
  progress: Partial<UploadJobProgress>
): Promise<void> {
  const redis = getRedis();
  const job = await getUploadJob(jobId);
  if (!job) return;

  job.progress = { ...job.progress, ...progress };
  job.updatedAt = Date.now();

  await redis.setex(`${JOB_PREFIX}${jobId}`, JOB_TTL, JSON.stringify(job));
}

export async function updateJobStatus(
  jobId: string,
  status: UploadJobStatus,
  result?: UploadJobResult,
  error?: string
): Promise<void> {
  const redis = getRedis();
  const job = await getUploadJob(jobId);
  if (!job) return;

  job.status = status;
  job.updatedAt = Date.now();

  if (result) job.result = result;
  if (error) job.error = error;

  if (status === "complete") {
    job.progress = {
      stage: "complete",
      current: 100,
      total: 100,
      message: "Upload complete!",
    };
  }

  await redis.setex(`${JOB_PREFIX}${jobId}`, JOB_TTL, JSON.stringify(job));
}

export async function deleteUploadJob(jobId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${JOB_PREFIX}${jobId}`);
}
