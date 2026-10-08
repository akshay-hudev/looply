# 🇮🇳 LocalMind --- AI Marketing Agent for Local Businesses

> **Turn a rough business idea into a locally-aware, platform-native,
> multilingual marketing campaign --- verify it, optimize it, and
> publish it after owner approval.**

LocalMind is a multi-agent AI marketing platform designed around the
**HR26-AI-02: Marketing Campaigns** problem statement from the Agnes AI
India Hackathon.

The core idea is simple:

``` text
Business Owner
      ↓
"Launch a weekend campaign for my café"
      ↓
LocalMind
      ↓
Understand Business + Locality + Audience
      ↓
Plan Campaign
      ↓
Create Platform-Specific Content
      ↓
Adapt to Local Language & Culture
      ↓
Verify Business Facts
      ↓
Predict & Optimize
      ↓
Owner Approval
      ↓
Publish to Authorized Channels
```

The system is built around **Agnes AI models and APIs**. Agnes is not
just an optional component: **Agnes 3.0 Flash is the primary
reasoning/model engine for the application**, with Agnes Image 2.5 Flash
and Agnes Video 2.5 used for visual and short-video generation where
appropriate.

------------------------------------------------------------------------

# 1. Problem We Are Solving

Small businesses often know exactly what they want to communicate but do
not have:

-   a marketing team
-   a designer
-   a copywriter
-   a social media strategist
-   a translator/localization expert
-   enough time to manage multiple platforms

A business owner may simply say:

> "We have a 20% discount on cold coffee this weekend. I want more
> college students to visit."

A traditional AI content generator might produce one generic caption.

**LocalMind goes much further.**

It understands:

-   What the business is
-   What the business wants to achieve
-   What is being offered
-   Who the target audience is
-   What exists around the business location
-   Which platforms should be used
-   What content format is appropriate
-   How the message should change for each platform
-   How the message should be expressed naturally in the local language
-   Whether the generated content changed the original offer
-   Which campaign variant is likely to perform better
-   What needs to be updated when the owner changes something
-   How to publish approved content through authorized accounts

------------------------------------------------------------------------

# 2. Hackathon Alignment

The HR26-AI-02 problem asks for a system that can:

1.  Generate a coherent campaign for different audiences, languages and
    channels.
2.  Predict campaign performance and autonomously optimize the campaign.
3.  Preserve the exact business intent while adapting messaging to
    cultural and linguistic contexts.

LocalMind is designed directly around these requirements.

The problem statement also emphasizes that the business owner should
remain in control and that changing requirements should be absorbed
without losing already approved information.

Our architecture addresses this through:

-   Campaign Manager
-   Campaign Brain / Campaign State
-   Locality Intelligence
-   Audience Intelligence
-   Platform-specific generation
-   Language & Cultural Adaptation
-   Campaign Truth Engine
-   Performance Prediction
-   Optimization
-   Human approval
-   Authorized publishing

------------------------------------------------------------------------

# 3. Our Core USP

Most AI marketing tools say:

> "Give us an idea and we will generate content."

LocalMind says:

> **"Give us your business goal. We understand your business, your
> locality, your audience and your platforms, then create, localize,
> verify, optimize and publish the campaign."**

Our strongest differentiators are:

### 🧠 Local Intelligence

The system uses verified locality information to understand the context
around the business.

### 📱 Platform-Native Marketing

We do not copy the same caption to every platform.

Instagram, WhatsApp and LinkedIn receive different versions based on
their audience, format and purpose.

### 🇮🇳 Native Cultural Localization

We do not perform simple word-for-word translation.

The system preserves business intent while producing natural, catchy,
culturally appropriate local-language marketing.

### 🛡️ Campaign Truth Engine

Every generated asset is checked against the original business facts
before it can be approved/published.

### 🔄 Campaign Evolution

If the owner changes one important fact, affected campaign assets are
identified and revalidated/re-generated.

### 🚀 Agentic Execution

After explicit owner approval and account authorization, the system can
publish through supported platform integrations.

------------------------------------------------------------------------

# 4. High-Level Architecture

``` text
                         ┌─────────────────────┐
                         │       USER          │
                         │ Voice / Text / Form │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ CAMPAIGN MANAGER    │
                         │       AGENT         │
                         └──────────┬──────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                    │
               ▼                    ▼                    ▼
       BUSINESS AGENT        LOCALITY AGENT       AUDIENCE AGENT
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │  STRATEGY AGENT   │
                          └─────────┬─────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │ CONTENT DIRECTOR     │
                        │       AGENT          │
                        └──────────┬───────────┘
                                   │
                   ┌───────────────┼────────────────┐
                   │               │                │
                   ▼               ▼                ▼
             TEXT CONTENT     VISUAL CONTENT    VIDEO CONTENT
                AGENT             AGENT             AGENT
                   │               │                │
                   │         ┌─────┼──────┐         │
                   │         ▼     ▼      ▼         │
                   │       Poster Story Carousel    │
                   │         Card                   │
                   └───────────────┬────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │ PLATFORM ADAPTATION      │
                    │          AGENT            │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
          Instagram          WhatsApp           LinkedIn
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ LANGUAGE & CULTURAL      │
                    │       AGENT              │
                    └────────────┬─────────────┘
                                 │
                   ┌─────────────┼─────────────┐
                   ▼             ▼             ▼
                Kannada        Hindi         English
                   │             │             │
                   └─────────────┼─────────────┘
                                 │
                                 ▼
                       ┌─────────────────┐
                       │ CAMPAIGN TRUTH  │
                       │    ENGINE       │
                       └────────┬────────┘
                                │
                         ┌──────┴──────┐
                         │             │
                       FAIL          PASS
                         │             │
                         ▼             ▼
                    Regenerate      Continue
                                       │
                                       ▼
                            PERFORMANCE AGENT
                                       │
                                       ▼
                              OPTIMIZATION AGENT
                                       │
                                       ▼
                                USER REVIEW
                                       │
                             ┌─────────┴─────────┐
                             ▼                   ▼
                          REJECT              APPROVE
                                                 │
                                                 ▼
                                     PUBLISHING AGENT
                                                 │
                                      ┌──────────┼─────────┐
                                      ▼          ▼         ▼
                                  Instagram  WhatsApp  LinkedIn
                                                 │
                                                 ▼
                                          ANALYTICS / FEEDBACK
```

------------------------------------------------------------------------

# 5. Central Concept --- Campaign Brain

The entire application revolves around a single structured **Campaign
Brain**.

Every agent reads from and/or updates this shared campaign state.

``` text
CAMPAIGN BRAIN
│
├── Business
│   ├── Name
│   ├── Category
│   ├── Products
│   └── Brand Voice
│
├── Campaign Objective
│
├── Offer Facts
│   ├── Product
│   ├── Price
│   ├── Discount
│   ├── Dates
│   ├── Times
│   └── Location
│
├── Locality Context
│   ├── Nearby places
│   ├── Audience signals
│   ├── Language signals
│   └── Local context
│
├── Audience Segments
│
├── Platforms
│
├── Languages
│
├── Content Requirements
│
├── Generated Assets
│
├── Verification Results
│
├── Performance Predictions
│
├── Optimization History
│
├── Approval Status
│
└── Publishing Status
```

This prevents agents from working with disconnected or outdated
information.

------------------------------------------------------------------------

# 6. Agent 1 --- Campaign Manager Agent

## Purpose

The Campaign Manager is the **orchestrator**.

It understands what the user wants and decides which specialized
workflows need to run.

It is the primary controller of the agentic system.

## Example

User:

> "I own a cafe near a college in Bengaluru. We have a new cold coffee
> for ₹149 and 20% off this weekend. I want more students."

The Campaign Manager converts this into:

``` json
{
  "business": "Cafe",
  "location": "Bengaluru",
  "product": "Cold Coffee",
  "price": "₹149",
  "offer": "20% off",
  "duration": "This weekend",
  "goal": "Increase student visits",
  "target_audience": "College students"
}
```

## Responsibilities

-   Understand user intent
-   Extract campaign information
-   Detect missing information
-   Ask follow-up questions
-   Create the campaign state
-   Invoke appropriate agents
-   Track progress
-   Handle user changes
-   Trigger re-validation when facts change
-   Present the final campaign for approval

------------------------------------------------------------------------

# 7. Agent 2 --- Business Intelligence Agent

## Purpose

Understand the business itself.

It builds the **Business Profile**.

Example:

``` text
BUSINESS PROFILE

Name:
ABC Cafe

Category:
Cafe

Products:
Coffee
Cold Coffee
Sandwiches

Brand Personality:
Youthful
Friendly
Affordable

Preferred Languages:
English
Kannada
```

## Why?

Without this agent, every campaign can sound generic.

The Business Agent gives every downstream agent a consistent
understanding of the business.

------------------------------------------------------------------------

# 8. Agent 3 --- Locality Intelligence Agent

## Purpose

Understand the environment around the business.

The system should not only know:

> "The business is in Bengaluru."

It should understand the relevant local context around it.

Possible signals include:

-   nearby colleges
-   schools
-   offices
-   residential areas
-   shopping areas
-   popular local places
-   local events where reliable data is available
-   local language signals
-   audience/context signals

## Important design principle

The LLM must not invent locality facts.

Instead:

``` text
Business Location
       ↓
Location / Places Data
       ↓
Structured Local Facts
       ↓
Locality Agent
       ↓
Marketing Interpretation
```

Agnes then reasons over the structured context.

## Example

If verified locality information indicates a strong college presence:

``` text
Locality Signal:
College cluster

Marketing Interpretation:
Student audience may be highly relevant
```

If the area has strong office activity:

``` text
Locality Signal:
Office cluster

Marketing Interpretation:
Professional / lunch / after-work messaging may be relevant
```

The locality should therefore **change marketing decisions**, not merely
appear as a map.

------------------------------------------------------------------------

# 9. Agent 4 --- Audience Intelligence Agent

## Purpose

Identify and segment the audience.

Example:

``` text
AUDIENCE 1
College Students

Motivation:
Affordable + trendy

Tone:
Fun

Platform:
Instagram

Language:
English + Kannada

Format:
Reel / Story
```

Another segment:

``` text
AUDIENCE 2
Working Professionals

Motivation:
Convenience + quality

Tone:
Professional

Platform:
WhatsApp / LinkedIn

Format:
Offer Card / Professional Post
```

## Responsibilities

-   Identify primary audience
-   Identify secondary audiences
-   Build audience profiles
-   Determine motivations
-   Recommend communication style
-   Recommend platform relevance
-   Pass audience context to the Strategy and Content agents

------------------------------------------------------------------------

# 10. Agent 5 --- Strategy Agent

## Purpose

Turn the campaign facts into a marketing strategy.

It decides:

### Objective

``` text
Increase weekend footfall
```

### Primary audience

``` text
College students
```

### Platforms

``` text
Instagram
WhatsApp
```

### Tone

``` text
Fun + youthful + local
```

### Formats

``` text
Instagram → Reel + Story
WhatsApp → Offer Card + Message
```

The Strategy Agent uses:

``` text
Business
+
Offer
+
Locality
+
Audience
+
Campaign Goal
```

to make its decisions.

------------------------------------------------------------------------

# 11. Agent 6 --- Content Director Agent

The Content Director is responsible for deciding **what content needs to
be produced**.

Instead of one huge Content Agent, we use specialized content agents.

``` text
                    CONTENT DIRECTOR
                           │
              ┌────────────┼─────────────┐
              ▼            ▼             ▼
        TEXT AGENT     VISUAL AGENT   VIDEO AGENT
```

The Content Director receives the strategy and delegates the work.

------------------------------------------------------------------------

# 12. Text Content Agent

## Creates

-   Captions
-   Headlines
-   Hooks
-   WhatsApp messages
-   Email copy
-   Ad copy
-   CTAs
-   Descriptions

It first creates the semantic/core message.

Example:

``` text
CORE MESSAGE

Product:
Cold Coffee

Price:
₹149

Offer:
20% off

Duration:
This weekend

Goal:
Drive student visits
```

It does not blindly translate this into every language.

Localization happens through the Language & Cultural Adaptation layer.

------------------------------------------------------------------------

# 13. Visual Content Agent

## Creates

-   Posters
-   Story Cards
-   Social media images
-   Offer cards
-   Carousel cards
-   Image variants

Possible formats:

``` text
Instagram Post
Instagram Story
Carousel
WhatsApp Offer Card
Facebook Image
LinkedIn Visual
```

The hackathon provides **Agnes Image 2.5 Flash** for posters and social
creatives, including editing and multi-image composition.

We will use it for the visual generation layer.

------------------------------------------------------------------------

# 14. Video Content Agent

## Creates

-   Reels
-   Shorts
-   Short promotional videos
-   Story videos

It decides:

-   Duration
-   Aspect ratio
-   Hook
-   Scene structure
-   Text overlays
-   CTA
-   Visual direction

The hackathon provides **Agnes Video 2.5 / Video 2.5 Flash** for short
promotional clips.

We will use the Agnes video API for supported short-video generation.

------------------------------------------------------------------------

# 15. User-Controlled Content Creation

The user should have two modes.

## Mode A --- User Chooses

``` text
What do you want?

☐ Instagram Post
☐ Instagram Story
☐ Reel
☐ Poster
☐ Carousel
☐ WhatsApp Card
☐ WhatsApp Message
☐ LinkedIn Post
☐ Short Video
```

The user can select one or multiple formats.

## Mode B --- AI Decides

``` text
☑ Let AI Decide
```

The Strategy/Content Director evaluates:

``` text
Goal
+
Audience
+
Platform
+
Locality
+
Product
+
Campaign type
```

and recommends:

> "Instagram Reel + Story + WhatsApp Offer Card"

The user can then accept or modify the recommendation.

------------------------------------------------------------------------

# 16. Agent 7 --- Platform Adaptation Agent

This is a critical component.

**One campaign does not mean one piece of content copied everywhere.**

The Platform Agent understands the characteristics of each destination.

## Instagram

Focus:

-   Visual hook
-   Short caption
-   Engagement
-   Reel/Story
-   CTA
-   Hashtags where appropriate

## WhatsApp

Focus:

-   Conversational communication
-   Direct offer
-   Short message
-   Clear CTA
-   Offer card

## LinkedIn

Focus:

-   Professional tone
-   Business context
-   Value proposition
-   Professional CTA

## Facebook

Focus:

-   Community relevance
-   Local context
-   Longer-form copy where appropriate

The core business intent remains the same, but the **execution
changes**.

------------------------------------------------------------------------

# 17. Agent 8 --- Language & Cultural Adaptation Agent

This is one of the most important parts of LocalMind.

We deliberately do **not** call it a simple Translation Agent.

Its goal is:

> **Preserve the business meaning while expressing it naturally and
> catchily in the target language and culture.**

------------------------------------------------------------------------

## The Wrong Approach

``` text
English
  ↓
Word-to-word translation
  ↓
Kannada
```

This can produce grammatically correct but unnatural marketing.

------------------------------------------------------------------------

## Our Approach

``` text
Business Intent
      ↓
Audience Context
      ↓
Locality Context
      ↓
Platform Context
      ↓
Language
      ↓
Cultural Adaptation
      ↓
Natural Expression
      ↓
Catchy Local Marketing Copy
```

------------------------------------------------------------------------

# 18. What the Language & Cultural Agent receives

``` text
Original Business Intent
Audience
Locality
Platform
Content Format
Brand Voice
Target Language
Offer Facts
```

Example:

``` text
INTENT:
Promote cold coffee

AUDIENCE:
College students

LOCALITY:
Bengaluru

PLATFORM:
Instagram

FORMAT:
Reel

LANGUAGE:
Kannada
```

It then creates content appropriate for that context.

------------------------------------------------------------------------

# 19. Native Idiom / Expression Generation

The agent can generate multiple candidate expressions.

``` text
Core Intent
    ↓
Language & Cultural Agent
    ↓
Candidate A
Candidate B
Candidate C
    ↓
Cultural/Naturalness Evaluation
    ↓
Select Best
```

The candidates are evaluated for:

### Naturalness

Would a native speaker actually say this?

### Catchiness

Does it work as marketing?

### Cultural appropriateness

Does it fit the local audience?

### Meaning preservation

Did the offer or intent change?

### Platform fit

Does it work as a Reel hook, Story, WhatsApp message, etc.?

------------------------------------------------------------------------

# 20. Code-Switching

The system can support natural combinations such as:

``` text
Kannada + English
Hindi + English
```

when that is appropriate for the selected audience and brand.

We do not force every piece of content to be 100% translated.

The goal is:

> **Natural local communication, not dictionary translation.**

------------------------------------------------------------------------

# 21. Locked vs Flexible Content

This is critical for safe localization.

## LOCKED

These facts cannot change:

``` text
Product
Price
Discount
Dates
Times
Location
Offer restrictions
```

## FLEXIBLE

These can change:

``` text
Hook
Sentence structure
Tone
Idioms
Word choice
Cultural expression
CTA wording
Platform-specific style
```

This lets the language agent be creative without changing what the
business promised.

------------------------------------------------------------------------

# 22. Language Agent Internal Structure

The Language & Cultural Adaptation layer can be logically divided into:

``` text
          LANGUAGE & CULTURE AGENT
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Language    Culture    Meaning
      Adapter     Adapter    Validator
          │          │          │
          └──────────┼──────────┘
                     ▼
              Final Local Copy
```

### Language Adapter

Handles grammar and vocabulary.

### Culture Adapter

Handles:

-   local expressions
-   idioms
-   tone
-   cultural references
-   natural phrasing

### Meaning Validator

Ensures:

> The localized content did not change the original business promise.

------------------------------------------------------------------------

# 23. Agent 9 --- Campaign Truth Engine / Fact Checker

This is our safety and consistency layer.

It compares:

``` text
Original Campaign Facts
+
Generated Asset
```

Example:

``` text
OFFER FACTS

Discount = 20%
Price = ₹149
Date = Saturday–Sunday
Product = Cold Coffee
```

Generated:

> "Get 30% off!"

Fact Checker:

``` text
❌ DISCOUNT MISMATCH
Expected: 20%
Generated: 30%
```

The asset is rejected and sent back for regeneration.

------------------------------------------------------------------------

# 24. What the Fact Checker validates

### Numerical facts

-   Price
-   Discount
-   Quantity
-   Percentage

### Temporal facts

-   Date
-   Time
-   Duration

### Product facts

-   Correct product
-   Correct service

### Location facts

-   Correct branch/location

### Claims

It should flag unsupported claims such as:

> "Best coffee in Bengaluru"

if the business never supplied evidence for that claim.

------------------------------------------------------------------------

# 25. Agent 10 --- Performance Agent

The Performance Agent evaluates campaign variants before launch.

Example:

``` text
VERSION A
"Weekend Coffee Deal"
Predicted effectiveness: 72

VERSION B
"Your Weekend Just Got Better ☕"
Predicted effectiveness: 86

VERSION C
"20% OFF"
Predicted effectiveness: 68
```

It recommends the strongest variant.

The UI should clearly distinguish:

> **AI-predicted performance**

from actual post-publication analytics.

The hackathon explicitly asks for campaign performance prediction.

------------------------------------------------------------------------

# 26. Agent 11 --- Optimization Agent

The Optimization Agent improves the campaign.

``` text
Generate
   ↓
Predict
   ↓
Critique
   ↓
Optimize
   ↓
Predict Again
```

Possible optimization dimensions:

-   Headline
-   Hook
-   CTA
-   Copy
-   Format
-   Audience emphasis
-   Platform emphasis
-   Creative variant
-   Timing recommendation

------------------------------------------------------------------------

# 27. Agent 12 --- Campaign Versioning / Change Agent

Businesses change their minds.

Example:

> "Actually, the discount is 25%, not 20%."

The system detects:

``` text
20% → 25%
```

Then identifies dependent assets:

``` text
Instagram Reel       ⚠
Instagram Story      ⚠
WhatsApp Message     ⚠
WhatsApp Card        ⚠
LinkedIn Post        ⚠
Kannada Copy         ⚠
Hindi Copy           ⚠
Poster               ⚠
```

The affected content is regenerated/revalidated.

------------------------------------------------------------------------

# 28. Campaign Dependency Graph

We can represent campaign dependencies internally:

``` text
OFFER
 │
 ├── Instagram Reel
 ├── Instagram Story
 ├── WhatsApp Message
 ├── WhatsApp Card
 ├── LinkedIn Post
 ├── Poster
 ├── Kannada Copy
 └── Hindi Copy
```

If:

``` text
20% → 25%
```

the system knows all these assets depend on the offer.

This enables intelligent campaign updates.

------------------------------------------------------------------------

# 29. Agent 13 --- User Review Layer

This is not necessarily an LLM agent.

It is the **human-control layer**.

The user sees:

``` text
CAMPAIGN READY

Instagram Reel       ✓
Instagram Story      ✓
WhatsApp Card        ✓
WhatsApp Message     ✓
LinkedIn Post        ✓

English              ✓
Kannada              ✓
Hindi                ✓

Offer Accuracy       100%
Local Relevance      91%
Platform Fit         89%
Predicted Impact     86%

[ EDIT ]
[ APPROVE ]
```

The business owner remains in control.

------------------------------------------------------------------------

# 30. Agent 14 --- Publishing Agent

After explicit approval:

``` text
USER APPROVES
      ↓
PUBLISHING AGENT
      ↓
Authorized Platform Accounts
      ↓
Publish
```

We should use the platform's supported authorization/OAuth mechanisms.

**We should never ask users to give LocalMind their social-media
passwords.**

Instead:

``` text
User
 ↓
OAuth / Platform Authorization
 ↓
Access Token
 ↓
Secure Server-Side Storage
 ↓
Publishing Agent
```

Publishing should happen only after the user has authorized the account
and approved the campaign.

------------------------------------------------------------------------

# 31. Publishing Status

The dashboard should show:

``` text
CAMPAIGN DEPLOYMENT

Instagram Reel      ✓ Published
Instagram Story     ✓ Published
WhatsApp            ✓ Published
LinkedIn            ⏳ Scheduled
```

Failures should be visible:

``` text
Instagram Story
⚠ Failed

Reason:
Platform API rejected request

[Retry]
```

------------------------------------------------------------------------

# 32. Agent 15 --- Analytics / Feedback Agent

After publishing, actual performance data can feed back into the system
where supported.

``` text
CAMPAIGN
   ↓
PUBLISH
   ↓
ACTUAL PERFORMANCE
   ↓
ANALYTICS AGENT
   ↓
LEARNINGS
   ↓
FUTURE STRATEGY
```

Example:

``` text
Instagram
Views: 12,400
CTR: 4.8%
Engagement: 8.2%

WhatsApp
Clicks: 720
Conversions: 11%
```

The agent can conclude:

> "WhatsApp produced stronger direct-response performance for this
> campaign."

This becomes useful context for the next campaign.

------------------------------------------------------------------------

# 33. Complete Agent Flow

``` text
USER
 │
 ▼
CAMPAIGN MANAGER
 │
 ├── Business Agent
 │
 ├── Locality Agent
 │
 └── Audience Agent
 │
 ▼
STRATEGY AGENT
 │
 ▼
CONTENT DIRECTOR
 │
 ├── Text Agent
 │
 ├── Visual Agent
 │
 └── Video Agent
 │
 ▼
PLATFORM ADAPTATION
 │
 ├── Instagram
 ├── WhatsApp
 ├── LinkedIn
 └── Other supported channels
 │
 ▼
LANGUAGE & CULTURAL ADAPTATION
 │
 ├── Language Adapter
 ├── Culture Adapter
 └── Meaning Validator
 │
 ▼
CAMPAIGN TRUTH ENGINE
 │
 ├── PASS ──────────────┐
 │                      │
 └── FAIL → Regenerate  │
                        ▼
                 PERFORMANCE AGENT
                        │
                        ▼
                 OPTIMIZATION AGENT
                        │
                        ▼
                   USER REVIEW
                        │
                  ┌─────┴─────┐
                  ▼           ▼
                EDIT        APPROVE
                              │
                              ▼
                       PUBLISHING AGENT
                              │
                              ▼
                     ANALYTICS / FEEDBACK
```

------------------------------------------------------------------------

# 34. Agnes AI Integration

## Agnes is a core part of LocalMind

The hackathon provides Agnes models specifically for this problem.

### Agnes 3.0 Flash --- Primary

Model identifier:

``` text
agnes-3.0-flash
```

We use it for:

-   Campaign planning
-   Business/context reasoning
-   Audience reasoning
-   Platform strategy
-   Multilingual content
-   Cultural adaptation
-   Fact reasoning
-   Performance prediction
-   Optimization
-   Agent/tool calling

The hackathon brief specifically identifies Agnes 3.0 Flash as the
primary model for campaign planning, multilingual copy, offer-fact
checking, performance prediction and optimization.

### Agnes Image 2.5 Flash

Model identifier:

``` text
agnes-image-2.5-flash
```

Use for:

-   Posters
-   Social media creatives
-   Story cards
-   Image variations
-   Multi-image composition

### Agnes Video 2.5 / Video 2.5 Flash

Model identifier:

``` text
agnes-video-2.5
```

Use for:

-   Short promotional videos
-   Reels/Shorts-style assets
-   Short campaign clips

The hackathon notes that video generation is asynchronous, so our
application must track the generation task and retrieve the completed
output before reporting success.

------------------------------------------------------------------------

# 35. Agnes API Layer

The application should have a dedicated Agnes service layer.

``` text
Frontend
    ↓
Backend
    ↓
Agent Orchestrator
    ↓
Agnes Service
    ↓
Agnes API
```

Do not scatter Agnes API calls throughout every component.

Instead:

``` text
agnes_service/
│
├── text_client
├── image_client
├── video_client
├── retry_handler
├── rate_limit_handler
└── response_parser
```

This makes the Agnes integration maintainable.

The hackathon specifies the Agnes API base URL and text/image/video
endpoints. API keys must remain server-side, and requests should be
queued/backed off under rate limits.

------------------------------------------------------------------------

# 36. Important Agnes Constraint for Voice

Agnes 3.0 Flash accepts text and image-URL input; it does not directly
provide speech-to-text or text-to-speech.

Therefore, if we provide a voice-first experience:

``` text
User speaks
     ↓
Speech-to-Text
     ↓
Campaign Manager
     ↓
Agnes 3.0 Flash
     ↓
Agent workflow
     ↓
Text response
     ↓
Text-to-Speech
     ↓
User hears response
```

STT/TTS will therefore be separate components, while **Agnes remains the
core reasoning model**.

------------------------------------------------------------------------

# 37. Example: Complete User Journey

User says:

> "I own a cafe near a college in Bengaluru. We have a new cold coffee
> for ₹149 and 20% off this weekend. I want more students."

### Step 1 --- Understand

``` text
✓ Business identified
✓ Product identified
✓ Price identified
✓ Offer identified
✓ Goal identified
✓ Audience identified
```

### Step 2 --- Local Intelligence

``` text
Analyzing locality...

✓ Nearby educational context
✓ Local audience signals
✓ Language signals
✓ Relevant local context
```

### Step 3 --- Strategy

``` text
Primary audience:
College students

Primary platform:
Instagram

Secondary:
WhatsApp

Recommended:
Reel + Story + WhatsApp Offer Card
```

### Step 4 --- Generate

``` text
✓ Instagram Reel
✓ Instagram Story
✓ WhatsApp Card
✓ WhatsApp Message
```

### Step 5 --- Localize

``` text
✓ English
✓ Kannada
✓ Native-style adaptation
✓ Cultural adaptation
```

### Step 6 --- Verify

``` text
Discount: 20% ✓
Price: ₹149 ✓
Product: Cold Coffee ✓
Duration: Weekend ✓
Unsupported claims: None ✓
```

### Step 7 --- Predict

``` text
Variant A → 74
Variant B → 86 ⭐
Variant C → 79
```

### Step 8 --- Optimize

``` text
Selected Variant B
CTA improved
Local-language hook improved
```

### Step 9 --- User Approval

``` text
[ EDIT ]       [ APPROVE ]
```

### Step 10 --- Publish

``` text
Instagram Reel   ✓
Instagram Story  ✓
WhatsApp         ✓
```

------------------------------------------------------------------------

# 38. Suggested Application Screens

## Screen 1 --- Dashboard

``` text
LOCALMIND

Active Campaigns
Drafts
Published
Analytics

[ + CREATE CAMPAIGN ]
```

## Screen 2 --- Campaign Creation

``` text
Tell us what you want:

🎙️ Speak
✍️ Type
📋 Use Form

[ Let AI Ask Me ]
```

## Screen 3 --- Local Intelligence

``` text
📍 Business Location

Local Context
Nearby Places
Audience Signals
Language Signals

[ View Locality Map ]
```

## Screen 4 --- Strategy

``` text
Campaign Goal
Target Audience
Platforms
Recommended Formats
Languages

[ Accept Strategy ]
```

## Screen 5 --- Content Studio

``` text
Instagram
 ├── Post
 ├── Story
 └── Reel

WhatsApp
 ├── Message
 └── Offer Card

LinkedIn
 └── Post

[ Regenerate ]
[ Edit ]
```

## Screen 6 --- Localization

``` text
English
Kannada
Hindi

Original Intent
Localized Version
Cultural Notes

[ Approve Language ]
```

## Screen 7 --- Truth Check

``` text
Offer Accuracy       100%
Product Accuracy     100%
Date Accuracy        100%
Location Accuracy    100%
Unsupported Claims     0

✓ Campaign Verified
```

## Screen 8 --- Performance

``` text
Variant A     74
Variant B     86 ⭐
Variant C     79

AI Recommendation:
Variant B
```

## Screen 9 --- Final Approval

``` text
CAMPAIGN READY

12 Assets
3 Languages
3 Platforms

[ EDIT ]
[ APPROVE & PUBLISH ]
```

## Screen 10 --- Analytics

``` text
Campaign Performance

Instagram
Views
Engagement
CTR

WhatsApp
Clicks
Conversions

LinkedIn
Impressions
Engagement
```

------------------------------------------------------------------------

# 39. Recommended Technical Architecture

``` text
Frontend
├── React
├── TypeScript
└── Campaign Dashboard

Backend
├── Python / FastAPI
├── Agent Orchestrator
├── Campaign State Manager
├── Agnes Service
├── Locality Service
├── Content Service
├── Verification Service
├── Publishing Service
└── Analytics Service

AI
├── Agnes 3.0 Flash
├── Agnes Image 2.5 Flash
└── Agnes Video 2.5

Data
├── PostgreSQL
├── Campaign State
├── Business Profiles
├── Offer Facts
├── Audience Profiles
├── Locality Context
├── Generated Assets
├── Campaign Versions
└── Analytics

External Services
├── Location / Places Data
├── Speech-to-Text (optional)
├── Text-to-Speech (optional)
└── Supported Social Platform APIs
```

------------------------------------------------------------------------

# 40. Recommended Backend Structure

``` text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── agents/
│   │   ├── campaign_manager.py
│   │   ├── business_agent.py
│   │   ├── locality_agent.py
│   │   ├── audience_agent.py
│   │   ├── strategy_agent.py
│   │   ├── content_director.py
│   │   ├── text_agent.py
│   │   ├── visual_agent.py
│   │   ├── video_agent.py
│   │   ├── platform_agent.py
│   │   ├── language_culture_agent.py
│   │   ├── fact_checker.py
│   │   ├── performance_agent.py
│   │   └── optimizer.py
│   │
│   ├── services/
│   │   ├── agnes_service.py
│   │   ├── locality_service.py
│   │   ├── media_service.py
│   │   ├── publishing_service.py
│   │   └── analytics_service.py
│   │
│   ├── models/
│   │   ├── campaign.py
│   │   ├── business.py
│   │   ├── audience.py
│   │   ├── asset.py
│   │   └── campaign_version.py
│   │
│   ├── validators/
│   │   ├── offer_validator.py
│   │   ├── localization_validator.py
│   │   └── content_validator.py
│   │
│   └── integrations/
│       ├── instagram/
│       ├── whatsapp/
│       └── linkedin/
│
└── tests/
```

------------------------------------------------------------------------

# 41. Important Design Principle --- Agents vs Tools

Not everything should be an LLM agent.

### Good candidates for Agnes/agent reasoning

-   Strategy
-   Audience interpretation
-   Content generation
-   Cultural adaptation
-   Platform adaptation
-   Campaign critique
-   Performance reasoning
-   Optimization

### Better handled deterministically

-   Price validation
-   Date validation
-   JSON schema validation
-   Campaign versioning
-   Dependency tracking
-   API authentication
-   Publishing
-   File storage
-   Video processing
-   Database operations

This combination gives us a more reliable system.

------------------------------------------------------------------------

# 42. MVP

The first working version should focus on:

``` text
1. User input
       ↓
2. Campaign Manager
       ↓
3. Business + Offer extraction
       ↓
4. Locality context
       ↓
5. Audience + Strategy
       ↓
6. Instagram + WhatsApp content
       ↓
7. Agnes-based localization
       ↓
8. Fact Checker
       ↓
9. User approval
```

Then add:

``` text
10. Image generation
11. Video generation
12. Performance prediction
13. Optimization
14. Publishing
15. Analytics
```

------------------------------------------------------------------------

# 43. Hackathon Demo Strategy

The best demo should show a **single business campaign from start to
finish**.

Example:

> Bengaluru café → college audience → weekend cold coffee campaign.

Demonstrate:

``` text
VOICE INPUT
     ↓
LOCALITY ANALYSIS
     ↓
AUDIENCE DETECTION
     ↓
STRATEGY
     ↓
PLATFORM-SPECIFIC CONTENT
     ↓
NATIVE KANNADA ADAPTATION
     ↓
POSTER + STORY + REEL
     ↓
FACT CHECK
     ↓
PERFORMANCE PREDICTION
     ↓
USER APPROVAL
     ↓
PUBLISH
```

Then perform the killer demo:

> "Change 20% discount to 25%."

Show:

``` text
Campaign change detected.

Affected assets: 8

Updating...
✓ Instagram
✓ WhatsApp
✓ Kannada
✓ English
✓ Poster
✓ Story
✓ Reel

All assets synchronized.
```

That demonstrates **agentic campaign management**, rather than simple
content generation.

------------------------------------------------------------------------

# 44. One-Line Pitch

> **LocalMind is an Agnes-powered AI marketing agent that understands a
> local business and its neighborhood, creates platform-specific
> campaigns in naturally localized languages, verifies every
> customer-facing claim, optimizes the campaign, and publishes it after
> owner approval.**

------------------------------------------------------------------------

# 45. Agnes Model Usage Summary

  Requirement               Agnes Model
  ------------------------- ---------------------------------------
  Campaign reasoning        **Agnes 3.0 Flash**
  Strategy                  **Agnes 3.0 Flash**
  Audience reasoning        **Agnes 3.0 Flash**
  Platform adaptation       **Agnes 3.0 Flash**
  Multilingual content      **Agnes 3.0 Flash**
  Cultural adaptation       **Agnes 3.0 Flash**
  Fact reasoning            **Agnes 3.0 Flash**
  Performance prediction    **Agnes 3.0 Flash**
  Optimization              **Agnes 3.0 Flash**
  Poster                    **Agnes Image 2.5 Flash**
  Story card                **Agnes Image 2.5 Flash**
  Social creatives          **Agnes Image 2.5 Flash**
  Short promotional video   **Agnes Video 2.5 / Video 2.5 Flash**
  Speech-to-text            Separate component
  Text-to-speech            Separate component
  Actual publishing         Platform APIs / integrations

------------------------------------------------------------------------

# 46. Final Product Vision

The ultimate workflow is:

``` text
              "I WANT MORE CUSTOMERS"
                         │
                         ▼
                ┌────────────────┐
                │    LOCALMIND   │
                └───────┬────────┘
                        │
              Understand the business
                        │
                        ▼
               Understand locality
                        │
                        ▼
               Understand audience
                        │
                        ▼
                 Build strategy
                        │
                        ▼
               Choose platforms
                        │
                        ▼
               Choose content type
                        │
                        ▼
               Create content
                        │
                        ▼
             Localize culturally
                        │
                        ▼
               Verify every fact
                        │
                        ▼
                 Predict impact
                        │
                        ▼
                   Optimize
                        │
                        ▼
                 OWNER APPROVES
                        │
                        ▼
                     PUBLISH
                        │
                        ▼
                   MEASURE
                        │
                        ▼
                IMPROVE NEXT TIME
```

**The central idea is not "AI writes ads."**

It is:

> ### **AI understands the business → understands the locality → understands the audience → decides the strategy → creates the right content → speaks like the local audience → verifies the business promise → optimizes → gets approval → executes the campaign.**

That is the product we should build around **Agnes**.
