require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const { uploadInvoice } = require('./lib/uploadInvoice');
const { printLabel } = require('./lib/printLabel');
const { combinedFlow } = require('./lib/combinedFlow');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

/** @type {Map<string, object>} */
const jobs = new Map();
let processing = false;
/** @type {Array<object>} */
const queue = [];

function validateInvoicePayload(body) {
  const orderId = body.orderId || body.orderNumber;
  const invoiceURL = body.invoiceURL || body.invoiceUrl;
  const packageType = body.packageType;
  const incoterms = body.incoterms;
  const callbackURL = body.callbackURL || body.callbackUrl;
  const items = body.items;
  const numberOfPackages = body.NumberOfPackages || body.numberOfPackages || body.packagesCount;

  if (!orderId) {
    return { error: 'orderId is required' };
  }
  if (!invoiceURL || typeof invoiceURL !== 'string') {
    return { error: 'invoiceURL is required' };
  }
  try {
    new URL(invoiceURL);
  } catch {
    return { error: 'invoiceURL must be a valid URL' };
  }

  if (callbackURL) {
    try {
      new URL(callbackURL);
    } catch {
      return { error: 'callbackURL must be a valid URL' };
    }
  }

  return {
    orderId: String(orderId),
    invoiceURL,
    packageType,
    incoterms,
    callbackURL,
    items,
    numberOfPackages: numberOfPackages ? Number(numberOfPackages) : null
  };
}

function validateShipPayload(body) {
  const orderId = body.orderId || body.orderNumber;
  const callbackURL = body.callbackURL || body.callbackUrl;

  if (!orderId) {
    return { error: 'orderId is required' };
  }

  if (callbackURL) {
    try {
      new URL(callbackURL);
    } catch {
      return { error: 'callbackURL must be a valid URL' };
    }
  }

  return { orderId: String(orderId), callbackURL };
}

async function processQueue() {
  if (processing || queue.length === 0) return;

  processing = true;
  const task = queue.shift();
  const job = jobs.get(task.jobId);

  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  job.logs.push('Job started');

  try {
    let runner;
    if (task.type === 'invoice') {
      runner = uploadInvoice;
    } else if (task.type === 'ship') {
      runner = printLabel;
    } else if (task.type === 'combined') {
      runner = combinedFlow;
    }

    const result = await runner({
      orderId: task.orderId,
      ...(task.type === 'invoice' || task.type === 'combined' ? {
        invoiceURL: task.invoiceURL,
        packageType: task.packageType,
        incoterms: task.incoterms,
        items: task.items,
        numberOfPackages: task.numberOfPackages
      } : {}),
      onProgress: (msg) => job.logs.push(msg)
    });

    job.status = 'completed';
    job.result = result;
    job.completedAt = new Date().toISOString();
    job.logs.push('Job completed');
  } catch (err) {
    job.status = 'failed';
    job.error = err.message || String(err);
    job.completedAt = new Date().toISOString();
    job.logs.push(`Job failed: ${job.error}`);
    console.error(`\n[SHIP FAILED] Order ${task.orderId}: ${job.error}\n`);
  } finally {
    const targetWebhook = task.callbackURL || 'https://hook.us2.make.com/e9htplj662l7d5p6ijdt2cisnk9lsvvd';
    try {
      console.log(`Sending webhook callback to ${targetWebhook}...`);
      await fetch(targetWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.jobId,
          type: job.type,
          orderId: job.orderId,
          orderNumber: job.orderId,
          status: job.status,
          trackingNumber: job.result ? job.result.trackingNumber : null,
          labelFile: job.result ? job.result.labelFile : null,
          result: job.result,
          error: job.error,
          completedAt: job.completedAt
        })
      });
      console.log('Webhook callback sent successfully.');
    } catch (webhookErr) {
      console.error(`Failed to send webhook callback to ${targetWebhook}:`, webhookErr.message);
    }

    processing = false;
    processQueue();
  }
}

function enqueueJob(type, orderId, invoiceURL = null, options = {}) {
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    type,
    orderId,
    invoiceURL,
    ...options,
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    logs: []
  };

  jobs.set(jobId, job);
  queue.push({ jobId, type, orderId, invoiceURL, ...options });
  processQueue();

  return job;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    queueLength: queue.length,
    processing,
    jobsInMemory: jobs.size
  });
});

/**
 * POST /api/invoice
 * Upload invoice to DHL order only — no label printing.
 * Body: { "orderId": "100013726", "invoiceURL": "https://drive.google.com/..." }
 */
app.post('/api/invoice', (req, res) => {
  const parsed = validateInvoicePayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const job = enqueueJob('invoice', parsed.orderId, parsed.invoiceURL, {
    packageType: parsed.packageType,
    insurance: parsed.insurance,
    incoterms: parsed.incoterms,
    callbackURL: parsed.callbackURL
  });

  res.status(202).json({
    message: 'Invoice upload job queued',
    jobId: job.jobId,
    orderId: job.orderId,
    status: job.status,
    statusUrl: `/api/jobs/${job.jobId}`
  });
});

/**
 * POST /api/ship
 * Print AWB label for one order and close. orderId only.
 * Body: { "orderId": "100013726" }
 */
app.post('/api/ship', (req, res) => {
  const parsed = validateShipPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const job = enqueueJob('ship', parsed.orderId, null, {
    callbackURL: parsed.callbackURL
  });

  res.status(202).json({
    message: 'Print label job queued',
    jobId: job.jobId,
    orderId: job.orderId,
    status: job.status,
    statusUrl: `/api/jobs/${job.jobId}`
  });
});

/**
 * POST /api/process
 * Combined flow: Upload invoice, set packageType, insurance, incoterms, correct item price/weight minimum errors, print AWB shipping label, and trigger webhook.
 * Body: { "orderId": "100013726", "invoiceURL": "https://drive.google.com/...", "packageType": "Midi Package", "insurance": "100.00", "incoterms": "DDP", "callbackURL": "https://..." }
 */
app.post('/api/process', (req, res) => {
  const parsed = validateInvoicePayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const job = enqueueJob('combined', parsed.orderId, parsed.invoiceURL, {
    packageType: parsed.packageType,
    incoterms: parsed.incoterms,
    callbackURL: parsed.callbackURL,
    items: parsed.items,
    numberOfPackages: parsed.numberOfPackages
  });

  res.status(202).json({
    message: 'Combined process job queued',
    jobId: job.jobId,
    orderId: job.orderId,
    status: job.status,
    statusUrl: `/api/jobs/${job.jobId}`
  });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'completed' && (job.type === 'ship' || job.type === 'combined') && job.result) {
    return res.json({
      jobId: job.jobId,
      status: job.status,
      orderId: job.orderId,
      trackingNumber: job.result.trackingNumber,
      labelFile: job.result.labelFile,
      result: job.result,
      completedAt: job.completedAt,
      logs: job.logs
    });
  }

  res.json(job);
});

app.get('/api/jobs', (_req, res) => {
  res.json({
    jobs: [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  });
});

app.listen(PORT, () => {
  console.log(`DHL Automation API running on http://localhost:${PORT}`);
  console.log(`POST http://localhost:${PORT}/api/invoice  (upload invoice only)`);
  console.log(`POST http://localhost:${PORT}/api/ship      (print AWB label)`);
  console.log(`POST http://localhost:${PORT}/api/process   (combined invoice + items + print)`);
  console.log(`GET  http://localhost:${PORT}/api/jobs/:jobId`);
});
