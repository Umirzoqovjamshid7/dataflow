// Fetch every API page; exceeding the bound fails visibly instead of truncating data.
export async function collectPages(fetchPage, size=500, maxPages=100) {
  const result = [];
  for (let page=0;page<maxPages;page++) {
    const rows = await fetchPage(page*size,size);
    if (!Array.isArray(rows)) throw new Error("API pagination response is invalid");
    result.push(...rows);
    if (rows.length<size) return result;
  }
  throw new Error("Ma'lumotlar hajmi katta. Sana yoki kampaniya filtrini toraytiring.");
}
