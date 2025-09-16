const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');


const { execSync } = require('child_process');
const AUTO_SETUP_DB = (process.env.AUTO_SETUP_DB || 'false').toLowerCase() === 'true';
if (AUTO_SETUP_DB) {
  try {
    console.log('AUTO_SETUP_DB is true — running `npx prisma db push` to create schema (if needed)...');
    execSync('npx prisma db push', { stdio: 'inherit', cwd: __dirname + '/../' });
    console.log('Running seed script to insert initial data...');
    execSync('node prisma/seed.js', { stdio: 'inherit', cwd: __dirname + '/../' });
    console.log('Database schema ensured and seed executed.');
  } catch (err) {
    console.error('AUTO_SETUP_DB: error while pushing schema or running seed (continuing):', err && err.message ? err.message : err);
  }
}

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'change_me';

const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 200 });
app.use(cors());
app.use(express.json());
app.use(apiLimiter);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('joinPoll', (pollId) => { socket.join('poll_' + pollId); });
  socket.on('leavePoll', (pollId) => { socket.leave('poll_' + pollId); });
});

async function getPollResults(pollId) {
  const options = await prisma.pollOption.findMany({
    where: { pollId },
    include: { votes: true },
    orderBy: { id: 'asc' }
  });
  return options.map(o => ({ id: o.id, text: o.text, count: o.votes.length }));
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'invalid authorization format' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: data.id } });
    if (!user) return res.status(401).json({ error: 'user not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') return res.status(403).json({ error: 'admin only' });
  next();
}

/** AUTH */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name,email,password required' });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: 'email exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });
  const token = generateToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email,password required' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  const token = generateToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.post('/api/polls', authMiddleware, async (req, res) => {
  const { question, options, publishAt } = req.body;
  if (!question || !Array.isArray(options) || options.filter(Boolean).length < 2) return res.status(400).json({ error: 'question, options(array with at least 2) required' });
  const isPublished = !publishAt || new Date(publishAt) <= new Date();
  const poll = await prisma.poll.create({
    data: {
      question,
      isPublished: Boolean(isPublished),
      publishAt: publishAt ? new Date(publishAt) : null,
      creator: { connect: { id: req.user.id } },
      options: { create: options.filter(Boolean).map(text => ({ text })) }
    },
    include: { options: true }
  });
  res.json(poll);
});

app.get('/api/polls', async (req, res) => {
  const q = req.query.q || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const skip = (page - 1) * limit;
  const where = {
    AND: [
      { isPublished: true },
      q ? { question: { contains: q, mode: 'insensitive' } } : {}
    ]
  };
  const [total, polls] = await Promise.all([
    prisma.poll.count({ where }),
    prisma.poll.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        options: {
          include: { votes: true }
        },
        creator: true
      }
    })
  ]);
  const clean = polls.map(p => ({
    id: p.id, question: p.question, isPublished: p.isPublished, isClosed: p.isClosed, publishAt: p.publishAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
    creator: { id: p.creator.id, name: p.creator.name },
    options: p.options.map(o => ({ id: o.id, text: o.text, count: o.votes.length }))
  }));
  res.json({ total, page, limit, polls: clean });
});

app.get('/api/polls/:id', async (req, res) => {
  const pollId = Number(req.params.id);
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { options: { include: { votes: true } }, creator: true } });
  if (!poll) return res.status(404).json({ error: 'not found' });
  res.json({
    id: poll.id, question: poll.question, isPublished: poll.isPublished, isClosed: poll.isClosed, publishAt: poll.publishAt,
    creator: { id: poll.creator.id, name: poll.creator.name },
    options: poll.options.map(o => ({ id: o.id, text: o.text, count: o.votes.length }))
  });
});

app.post('/api/polls/:id/close', authMiddleware, adminOnly, async (req, res) => {
  const pollId = Number(req.params.id);
  const poll = await prisma.poll.update({ where: { id: pollId }, data: { isClosed: true } });
  io.to('poll_' + pollId).emit('pollClosed', { pollId });
  res.json(poll);
});

app.get('/api/polls/:id/voters', authMiddleware, adminOnly, async (req, res) => {
  const pollId = Number(req.params.id);
  const votes = await prisma.vote.findMany({ where: { pollId }, include: { user: true, pollOption: true } });
  res.json(votes.map(v => ({ id: v.id, user: { id: v.user.id, name: v.user.name, email: v.user.email }, option: { id: v.pollOption.id, text: v.pollOption.text }, createdAt: v.createdAt })));
});

app.post('/api/polls/:id/vote', authMiddleware, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const { optionId } = req.body;
    if (!optionId) return res.status(400).json({ error: 'optionId required' });
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    if (!poll.isPublished) return res.status(400).json({ error: 'poll not published' });
    if (poll.isClosed) return res.status(400).json({ error: 'poll is closed' });
    const option = await prisma.pollOption.findUnique({ where: { id: Number(optionId) } });
    if (!option || option.pollId !== pollId) return res.status(400).json({ error: 'option does not belong to poll' });
    const existing = await prisma.vote.findFirst({ where: { userId: req.user.id, pollId } });
    if (existing) {
      if (existing.pollOptionId === Number(optionId)) {
        // no-op
      } else {
        await prisma.vote.update({ where: { id: existing.id }, data: { pollOptionId: Number(optionId) } });
      }
    } else {
      await prisma.vote.create({ data: { user: { connect: { id: req.user.id } }, poll: { connect: { id: pollId } }, pollOption: { connect: { id: Number(optionId) } } } });
    }
    const results = await getPollResults(pollId);
    io.to('poll_' + pollId).emit('voteUpdate', { pollId, results });
    res.json({ pollId, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});


app.put('/api/polls/:id', authMiddleware, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const { question, options, isPublished, publishAt } = req.body;
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    if (req.user.role !== 'ADMIN' && poll.creatorUserId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const updated = await prisma.poll.update({
      where: { id: pollId },
      data: { question: question ?? poll.question, isPublished: typeof isPublished === 'boolean' ? isPublished : poll.isPublished, publishAt: publishAt ? new Date(publishAt) : poll.publishAt }
    });

    if (Array.isArray(options)) {
      await prisma.vote.deleteMany({ where: { pollId } });
      await prisma.pollOption.deleteMany({ where: { pollId } });
      await prisma.pollOption.createMany({ data: options.filter(Boolean).map((text) => ({ text, pollId })) });
    }

    const result = await prisma.poll.findUnique({ where: { id: pollId }, include: { options: true, creator: true } });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});


// Delete poll (only creator or admin) - cleans up options and votes
app.delete('/api/polls/:id', authMiddleware, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    if (req.user.role !== 'ADMIN' && poll.creatorUserId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    // delete votes, options, then poll
    await prisma.vote.deleteMany({ where: { pollId } });
    await prisma.pollOption.deleteMany({ where: { pollId } });
    await prisma.poll.delete({ where: { id: pollId } });

    io.to('poll_' + pollId).emit('pollDeleted', { pollId });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});


// Update a poll option (creator or admin)
app.put('/api/polls/:id/options/:optionId', authMiddleware, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const optionId = Number(req.params.optionId);
    const { text } = req.body;
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    if (req.user.role !== 'ADMIN' && poll.creatorUserId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const opt = await prisma.pollOption.findUnique({ where: { id: optionId } });
    if (!opt || opt.pollId !== pollId) return res.status(404).json({ error: 'option not found' });

    const updated = await prisma.pollOption.update({ where: { id: optionId }, data: { text: text ?? opt.text } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Delete a poll option (creator or admin) - also delete votes for that option
app.delete('/api/polls/:id/options/:optionId', authMiddleware, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const optionId = Number(req.params.optionId);
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'poll not found' });
    if (req.user.role !== 'ADMIN' && poll.creatorUserId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const opt = await prisma.pollOption.findUnique({ where: { id: optionId } });
    if (!opt || opt.pollId !== pollId) return res.status(404).json({ error: 'option not found' });

    await prisma.vote.deleteMany({ where: { pollOptionId: optionId } });
    await prisma.pollOption.delete({ where: { id: optionId } });

    const results = await getPollResults(pollId);
    io.to('poll_' + pollId).emit('voteUpdate', { pollId, results });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const publishable = await prisma.poll.findMany({ where: { isPublished: false, publishAt: { not: null, lte: now } } });
    for (const p of publishable) {
      await prisma.poll.update({ where: { id: p.id }, data: { isPublished: true } });
      const results = await getPollResults(p.id);
      io.to('poll_' + p.id).emit('voteUpdate', { pollId: p.id, results });
      console.log('Auto-published poll', p.id);
    }
  } catch (err) { console.error('cron error', err); }
});


// Admin: list all polls (including unpublished). Admin-only.
app.get('/api/admin/polls', authMiddleware, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'admin only' });
  const polls = await prisma.poll.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      options: { include: { votes: true } },
      creator: true
    }
  });
  const clean = polls.map(p => ({
    id: p.id,
    question: p.question,
    isPublished: p.isPublished,
    isClosed: p.isClosed,
    publishAt: p.publishAt,
    creator: { id: p.creator.id, name: p.creator.name },
    options: p.options.map(o => ({ id: o.id, text: o.text, count: o.votes.length }))
  }));
  res.json({ total: clean.length, polls: clean });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server listening on', PORT));