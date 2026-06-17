const jobId = "61150f2e-5444-4543-8182-2f34ef7fecc0";

fetch(`http://localhost:3000/api/jobs/${jobId}`)
  .then(res => res.json())
  .then(data => {
    console.log("=== JOB STATUS ===");
    console.log("Status:", data.status);
    console.log("Error:", data.error);
    console.log("Logs:");
    data.logs.forEach(log => console.log("  -", log));
  })
  .catch(err => console.error(err));
