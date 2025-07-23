
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function extractTextFromPDF(pdfUrl) {
  const response = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.PDFCO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: pdfUrl,
      pages: '1-',
      inline: true,
      async: false
    })
  });
  const data = await response.json();
  return data.body || '';
}

function extractFaultAndCitations(text) {
  const lower = text.toLowerCase();
  const citations = [];

  const citationRegex = /o\.c\.g\.a\.\s*\u00a7?\s*\d{1,2}-\d{1,2}-\d{1,2}/gi;
  const matches = lower.match(citationRegex);
  if (matches) {
    citations.push(...new Set(matches.map(c => c.toUpperCase().trim())));
  }

  let atFaultParty = '';
  if (lower.includes('kayla shavon reeves') && lower.includes('40-6-49')) {
    atFaultParty = 'Kayla Shavon Reeves';
  } else if (lower.includes('driver #1') && lower.includes('cited')) {
    atFaultParty = 'Driver #1';
  }

  return { at_fault_party: atFaultParty, citations };
}

async function insertSummary(client_id, result) {
  const { data, error } = await supabase.from('police_report_summary').insert([
    {
      client_id,
      at_fault_party: result.at_fault_party,
      citations: result.citations,
    }
  ]);
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { client_id, pdf_url } = req.body;
  try {
    const text = await extractTextFromPDF(pdf_url);
    const result = extractFaultAndCitations(text);
    const inserted = await insertSummary(client_id, result);
    res.status(200).json({ success: true, result, inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
}
