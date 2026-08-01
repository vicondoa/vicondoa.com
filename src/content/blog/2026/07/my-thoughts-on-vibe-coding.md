---
title: 'My Thoughts on Vibe Coding'
description:
  'I love software engineering. I have been coding since I was 15 and got my
  first tech job at 18. I have never been more excited about my special
  interest, even while it is going through a radical change, and here is why.'
publishedAt: 2026-07-31
topics:
  - AI
  - Programming
  - Meta
---

I have always viewed software development, architecture, and engineering in
general as forms of art. Software is an expression of my creativity. I love the
physical act of writing code. I love debugging through layers I do not
understand yet and following a problem further down the stack. Today, I can
explore levels of a system that I could only have dreamed of reaching when I
was 18.

For most of my career, I have told myself that software development was going to
be a lot of fun and that I could make a good living doing it. I also believed
that eventually somebody would write the code that writes the code, and that
would be game over. That time has arrived, and I find myself more excited and
more engaged than ever.

## Why I Became a Manager

I have been an engineering manager or engineering lead for around 20 years. I
have never had much desire to become a higher-level manager. I did not want to
spend all of my time managing people, projects, schedules, and organizational
processes. I always wanted to remain close to the code. Over time, I learned
that it is possible to lead a larger team and still make time to build things.
It requires discipline, and the amount of time available for coding becomes
smaller, but I have always tried to protect it.

What I really want is the opportunity to express my creativity through designs,
code, and unusual ways of looking at problems. One reason I enjoyed managing
engineers was that it gave me a way to put a team to work on ideas I believed
in. Those ideas often became better once another person made them their own.
Sometimes the result took on a life of its own and continued without much
involvement from me. I was still happy with the outcome. Seeing an idea grow
beyond my original version has always been one of the most rewarding parts of
leading a team, and vibe coding gives me a similar experience.

## Managing Coding Agents

I constantly have ideas that sit near the boundary of what seems possible, what
is currently available, or what people have tried before. Sometimes they involve
combining existing components in a new way. Sometimes they come from noticing a
limitation and wondering whether it is really fundamental or simply something
nobody has spent enough time trying to solve. In the past, researching and
prototyping one of these ideas could consume weeks or months, and I had far more
ideas than I had time to investigate. Coding agents have changed that.

I can use many of the management skills I already have to work with them. I can
explain an idea, define the problem, establish its scope, describe the outcome I
am looking for, and identify the components that may be involved. My technical
experience helps me articulate what I want and evaluate whether a proposed
approach is plausible. When an agent says something cannot be done, I can push
back when my experience tells me there is probably another path. When an
implementation comes back, I can look for the same problems I would expect from
a junior developer or from a project that grew too quickly.

I can look for obvious security holes, poor naming, unclear abstractions, weak
boundaries, unnecessary complexity, slow builds, unreliable tests, duplicated
patterns, and designs that will become increasingly difficult to extend. I watch
for code that cannot be tested because of the way it was designed, and for
functionality that duplicates something that already exists somewhere else in
the project. I can recognize the point where a project starts fighting every new
feature. I can see when a shortcut is about to multiply into dozens of bugs.

None of these signals are new. Slop always looked like slop, AI or not. I am
applying the same judgment I have applied for my entire career, and all of those
inputs help me become a better manager for my coding agents.

## The Fundamentals Still Matter

The fundamental practices of good software development still apply. Builds
should be fast. Tests should run quickly and reliably. Important behavior should
have coverage. Names should communicate intent. Conventions should be
consistent. Components should have understandable responsibilities and
boundaries.

The patterns established early in a project matter even more when agents are
involved. Agents copy what already exists. A good pattern can spread across the
codebase, and a bad pattern can spread just as quickly. A project needs examples
worth copying.

This means maintaining a clean project structure, paying attention to naming,
reviewing generated code, and correcting bad patterns before they become
established conventions. It also means investing in automation so the project
can evaluate itself continuously. I want builds, tests, linting, formatting,
architecture checks, and other forms of validation to run automatically. I want
coding agents to receive fast feedback and correct their work while the context
is still fresh. I want them to review one another, challenge assumptions, and
keep working until the implementation satisfies the goals that were established.
These practices were useful when engineers wrote every line by hand, and they
become even more valuable when the amount of code that can be produced increases
dramatically.

## Learning Through Unfamiliar Systems

Coding agents also let me explore areas where I am less experienced. I can point
them toward a subsystem, ask them to trace how it works, inspect the source,
build a prototype, and explain what they found. I still need enough
understanding to evaluate the result. The process gives me a path into
unfamiliar territory and helps me learn while something useful is being built.

This is especially interesting to me because I enjoy going down the stack. I
like learning how a protocol works, how a kernel interface behaves, how a device
is exposed to a virtual machine, how data moves between processes, or why a
system performs differently from what I expected. In the past, much of the
available time would be spent collecting information, navigating code, and
separating useful signals from thousands of lines of logs.

Now I can direct an agent toward the problem and ask it to investigate. I can
have it gather evidence, test theories, compare implementations, and return with
an explanation. I can then use my own experience to decide where to go next.

Debugging still requires judgment. The amount of grunt work involved has been
reduced substantially, and I appreciate that more than almost anything else. I
do not miss squinting through enormous logs while trying to find the one line
that explains what happened.

## More Ideas Can Become Real

The largest change for me is that I can work on projects I simply would not have
had time to build on my own. These are often ambitious projects. They may cross
several technical areas, involve technologies I am still learning, or require
enough repetitive implementation that I would previously have abandoned the idea
before reaching a usable prototype.

Coding agents give me leverage. They allow me to spend more of my time on
architecture, direction, experimentation, review, and the parts of engineering
where my experience is most useful. They also allow me to be more creative.

I can try an idea without committing months of my life to discovering whether it
works. I can explore several possible implementations. I can throw away an
approach that fails and continue with the knowledge gained from it. I can take
an idea that once existed only as a mental sketch and turn it into something I
can run, measure, and improve. That has made software development feel new to me
again.

## What to Expect From This Blog

This is my first blog post, and I want it to set expectations for what will
appear here in the future. I will write about projects I am actively building
and experiments I am running. Many of these projects exist because coding agents
have made them practical for me to pursue. They are ideas that I largely would
not have had enough time to implement on my own.

I am using these projects as an opportunity to encode the best engineering
practices I have learned throughout my career. I want those practices to become
part of the automated development process. I want agents to build, test, review,
measure, challenge, and improve their own work while I provide direction and
engineering judgment. My hope is that the results will be creative, useful, and
willing to push against the limits of what has already been done.

Some experiments will work. Some will expose limitations. Some will probably
lead somewhere completely different from where I expected. I plan to write about
the process honestly, including the hacks, failed attempts, unexpected
discoveries, and compromises required to make these systems work.

If you are wary of using software built with AI assistance, you are welcome to
leave my implementations alone. You can still take the prototypes, designs,
research, and ideas and run with them yourself. Please let me know when you do,
because I would genuinely enjoy seeing how far you take them.

## A Note About the Writing

I have had difficulties with language since I was young. I sometimes struggle to
express ideas as clearly or elegantly as I understand them in my head. That has
limited me in ways that are difficult to explain. I use AI to help write these
posts, and I will continue using it.

The ideas, opinions, experiences, technical details, and vast majority of the
content come from me. AI helps me organize my thoughts, correct my grammar, and
articulate things more clearly while preserving my language and intent.

The same principle applies to the projects I will write about here. I provide
the ideas, direction, experience, judgment, and standards. The agents help me
execute at a scale that I could not reach alone, and I am excited to see where
that takes me.

Happy reading.
