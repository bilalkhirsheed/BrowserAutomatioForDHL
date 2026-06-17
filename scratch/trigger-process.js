const payload = {
  orderId: "100013698",
  invoiceURL: "https://drive.google.com/file/d/1VxxXRve1nfM2ESBddfhH84iuP3j1ds2B/view?usp=sharing",
  packageType: "Mini",
  incoterms: "DAP",
  NumberOfPackages: 2,
  items: [
    {
      name: "Power Supply",
      sku: "TP-MTSE-102300",
      quantity: 1,
      price: 200,
      weight: 2
    }
  ]
};

console.log("Sending POST request to http://localhost:3000/api/process...");
fetch("http://localhost:3000/api/process", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
  .then(res => res.json())
  .then(data => {
    console.log("Response:", data);
  })
  .catch(err => {
    console.error("Error:", err);
  });
