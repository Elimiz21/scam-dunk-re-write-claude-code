type CredentialsUser = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  hashedPassword: string | null;
  emailVerified: Date | null;
};

type CredentialsUserClient = {
  user: {
    findUnique(args: {
      where: { email: string };
      select: {
        id: true;
        email: true;
        name: true;
        plan: true;
        hashedPassword: true;
        emailVerified: true;
      };
    }): Promise<CredentialsUser | null>;
  };
};

export function findCredentialsUser(
  client: CredentialsUserClient,
  email: string,
) {
  return client.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      hashedPassword: true,
      emailVerified: true,
    },
  });
}
