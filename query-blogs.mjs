const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

try {
  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      slug: true,
      coverImage: true,
      category: true,
      publishedAt: true
    },
    orderBy: { publishedAt: 'desc' }
  });
  
  console.log(JSON.stringify(posts, null, 2));
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await prisma.$disconnect();
}
