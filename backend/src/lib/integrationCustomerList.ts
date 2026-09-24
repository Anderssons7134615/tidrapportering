type CustomerReader = {
  customer: {
    findMany(args: {
      where: { companyId: string };
      select: Record<'id' | 'name' | 'contactPerson' | 'email' | 'phone' | 'address' | 'active', true>;
      orderBy: Array<Record<string, 'asc'>>;
    }): Promise<unknown>;
  };
};

export function listIntegrationCustomers(db: CustomerReader, companyId: string) {
  return db.customer.findMany({
    where: { companyId },
    select: { id: true, name: true, contactPerson: true, email: true, phone: true, address: true, active: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}
