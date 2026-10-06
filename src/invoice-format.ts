export function shortenInvoice(invoice: string) {
  return invoice.length > 16 ? `${invoice.slice(0, 8)}...${invoice.slice(-3)}` : invoice;
}
