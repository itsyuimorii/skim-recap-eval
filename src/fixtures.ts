// The corpus the two backends are compared on.
//
// Passages are literal constants, never fetched. A comparison anyone else can
// re-run — including the Chrome team — cannot depend on a page still being up,
// still being outside a paywall, and still laid out the way it was.
//
// Capture them through the real pipeline rather than copying prose out of an
// article by hand: flick past a passage on the source page, then read
// `__skimRecapLastPayload.text` from the isolated world. Extraction is most of
// what this extension does, so a hand-picked passage would be measuring a
// corpus the product never actually produces.

import type { SummaryMode } from "./messages";

export interface Fixture {
  id: string;
  title: string;
  /** Why this passage is in the corpus. Rendered beside the outputs, so
   *  whoever is judging has the rubric on screen. */
  hypothesis: string;
  category:
    "bounded" | "undefined-term" | "multilingual" | "context" | "degenerate";
  /** BCP-47 of the passage itself. */
  lang: string;
  /** '' means "follow the passage", which is what the popup's 'off' produces. */
  targetLang: string;
  modes: SummaryMode[];
  /** Part of the short subset that can be run live in a meeting. */
  demo?: boolean;
  /** Named by the passage, never defined by it. The feynman rubric: a correct
   *  feynman answer should define these; a correct recap should not, because
   *  the passage gave it nothing to define them with. Verify each one against
   *  the passage text rather than assuming it from the subject area. */
  undefinedTerms?: string[];
  /** Named AND defined by the passage. Kept as a separate list because without
   *  it the two cases are indistinguishable: a feynman answer that only covers
   *  these has paraphrased the passage, not supplied knowledge the recap could
   *  not have. A fixture whose terms are all in this list does not discriminate
   *  between backends and should be replaced. */
  definedInPassage?: string[];
  /** Facts a correct feynman answer has to supply that the passage never
   *  states. A correct recap must NOT contain these. */
  requiresWorldKnowledge?: string[];
  source: {
    url: string;
    capturedAt: string;
    extensionVersion: string;
    /** Licence of the source page, and — where the licence does not permit
     *  redistribution — what is stored instead of the text. The corpus is
     *  published, so this has to be decided per passage rather than assumed. */
    licence?: string;
    note?: string;
  };
  text: string;
}

/* Every entry is captured from a real page through the real extraction path;
   nothing here is written by hand to make a point. Promoted from the capture
   list in eval.html once a passage has earned a place — the hypothesis field
   is the deciding question, not the text. */
/* Nine passages, captured through the extension's own extraction path and
   promoted here so the corpus travels with the results instead of living only
   in browser storage. Committing them is what makes the comparison re-runnable
   by anyone else; fetching the pages at eval time would not, since a passage
   depends on the page still being up, outside a paywall, and laid out the same
   way.

   Every judgement below was written against the passage text. An earlier
   version filled these fields in per subject area, which is how three
   pharmacology entries came to share one sentence naming PXR and bergamottin —
   words that appear in none of them — and how the saxagliptin entry came to
   claim DPP-4 was undefined when its first sentence defines it. Two entries
   were reclassified from undefined-term to bounded on the same reading.

   Note the source count: nine passages, five sources. Three pharmacology
   entries are sections of one review, two ML entries are sections of one paper,
   and two AI entries are overlapping slices of one post. Treating them as nine
   independent observations would overstate the corpus. */
export const FIXTURES: Fixture[] = [
  {
    id: "cap_1786408188100",
    title: "AI · pre-training timelines (a)",
    hypothesis:
      "A primer that explains its own vocabulary: what a pre-training checkpoint is, what distillation does, how the knowledge-cutoff estimate was made. Reclassified from undefined-term. Overlaps heavily with the (b) slice below — the two are not independent passages and should not be counted as two observations of the same effect.",
    category: "bounded",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: ["frontier model", "base model", "recency-biased dataset"],
    definedInPassage: [
      "pre-training checkpoint",
      "post-training",
      "distillation",
      "knowledge cutoff",
      "the multiple-choice probing method",
    ],
    requiresWorldKnowledge: [],
    source: {
      url: "https://blog.sshh.io/p/exploring-claudegpt-knowledge-cutoffs",
      capturedAt: "2026-08-11T00:29:48.100Z",
      extensionVersion: "0.4.0",
      licence:
        "blog.sshh.io. Personal blog, no licence stated, so all rights reserved. " +
        "Published here as an attributed excerpt for evaluation; removed on " +
        "request from the rights holder.",
    },
    text: "Exploring Claude/GPT Knowledge Cutoffs & Pre-training Timelines\n\nAn analysis of what models know and what it tells us about how they were trained.\n\nEverything here is an estimate. It’s possible that some speculation in this post is totally incorrect given there’s not a ton of publicly available ground truth to verify against.\n\nHow frontier models are trained\n\nAs a brief primer (see Alex Wa’s blog for more), how we train massive large language models has converaged into 3 stages:\n\nWhile increasingly more compute is spent on post-training for boosting a model’s reasoning and problem solving, one of the most expensive and data-intensive steps is generating that pre-training checkpoint (by ‘checkpoint’ think of a massive claude-super-secret-2026-11-01-base.cpkt file).\n\nWhile that’s happening, the “capability” and “post-training” teams will run experiments for how to improve on the most recent base model. Advancements in post-training and capabilities often manifest as minor versions of released models. These teams often also “distill” a single post-trained model into smaller variants that become model families (Fable/Opus/Sonnet/Haiku, Sol/Terra/Luna). Labs may also release post-trained models from half-baked pre-training checkpoints as soon as x% of the version N+1 checkpoint is better than the 100% baked version N checkpoint.\n\nWith this in mind, I was curious how much of this process you can “see” just by probing the model over the official APIs.\n\nModel Knowledge Timelines\n\nTo estimate the pre-training checkpoint dates, I constructed a dataset of daily-facts from Wikipedia (e.g. 2025 in the United States) and gave every model an 8-way multiple choice quiz on what happened on a given day. Then, by analyzing the error rate timeline, you can see roughly when it loses signal from its training dataset.\n\nAnthropic models Opus 4.7 onwards are all from the same training run that cuts off just around late December 2025. This is derived from how they all share a very similar effective knowledge cutoff (green). A core assumption I’m making here is that the pre-training base model completion date is highly correlated with the dataset timespan used, if that’s wrong these results could be off by some offset (e.g. it’s actually Jan 2026). It’s also interesting that Opus 4.7+ models all have a published reliable and overall knowledge cutoff that’s identical — maybe that’s due to a new post-training technique being used?\n\nIt ends up being fairly correlated with fact-based estimates. If you look closely you can see some vertical lines within a few of the families of models.\n\nInterpreting this graph as X = “pre-training corpus” and Y = “post-trained behavior”, these vertical strips (X constant, Y increasing) visualize active post-training on recency-biased datasets. Potentially distillation from old copies of teacher models is what causes smaller models to self-report older dates.\n\nSelf-reported Identity\n\nYou can also make predictions on training timelines and datasets indirectly by looking at who the models think they are. The more a model sees “I am X” in its pre-training dataset, the more likely it is to repeat that when pushed and given no other grounding context.\n\nVertical bands show clear patterns of labs training on past-model outputs (from users). For OpenAI it’s GPT-4, GPT-4o, GPT-4.1 for a bit, GPT-5 and “ChatGPT” most recently. For Anthropic it’s 3.5 Sonnet then more recent models swap to Sonnet 4.5. This seems to align pretty well with training on chats from ChatGPT.com and Claude.ai respectively, where users chatted with the latest model and whose sessions became training material (directly or via web contamination). It seems unlikely to me these are coming from internal synthetic datasets given those would be much easier to suppress model identity (vs being embedded in the system prompt in the consumer chat sessions). Training-on-chats isn’t novel information but it is interesting to see expressed literally with probing like this.",
  },
  {
    id: "cap_1786408193592",
    title: "Education research · control",
    hypothesis:
      "Control passage. It defines theory of mind explicitly and its argument is carried in ordinary language, so both backends should manage it. The one thing it never expands is ASD itself — a small, checkable test of whether explain mode notices an abbreviation the passage assumes.",
    category: "bounded",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: [
      "ASD",
      "story mapping",
      "graphic organizers",
      "scaffolding",
      "inferencing",
    ],
    definedInPassage: ["theory of mind"],
    requiresWorldKnowledge: ["ASD is autism spectrum disorder"],
    source: {
      url: "https://www.shanahanonliteracy.com/blog/autism-and-reading-part-2-lessons-to-be-learned-from-special-kids",
      capturedAt: "2026-08-11T00:29:53.592Z",
      extensionVersion: "0.4.0",
      licence:
        "shanahanonliteracy.com. Personal blog, no licence stated, so all rights " +
        "reserved. Published here as an attributed excerpt for evaluation; " +
        "removed on request from the rights holder.",
    },
    text: "Autism and Reading Part 2: Lessons to be Learned from Special Kids\n\nIt is also worth noting that there are several studies that treat ASD like any other reading disability, simply increasing the dosage or intensity of what appears to work reasonably well with everyone else (Head, 2023; Kim, 2023; Kim, et al., 2024; Marshall & Myers, 2021; O’Neil, 2024; Ricketts, 2011; Turner, Remington, & Hill, 2017). Such studies evaluate whether shared reading, story mapping, direct instruction, intensive review, increased scaffolding, graphic organizers and such can work with ASD, if delivered under positive circumstances (e.g., one-on-one teaching) or with increased dosage. Generally, these studies report positive outcomes. What their success would be like in regular classroom settings is anyone’s guess. In any event, there appear to be learning pay offs from intensified or improved delivery of typical comprehension instruction.\n\nYes. In fact, there is. Research shows that individuals with ASD have problems understanding the mental states of others (Kimhi, et al., 2025; Lee, Chan, & Tong, 2022; O’Hare, et al., 2009). This is what is meant by “theory of mind.” At least part of the reason for the socialization problems ASD kids face is their difficulties intuiting the feelings and intentions of others. This makes empathy a challenge and undermines their comprehension of social situations and relations.\n\nTypical reading tests aren’t aimed at identifying social insensitivity. They may include questions that probe the psychology of characters including motivations or emotional responses to events. But that usually isn’t the point of such questions. I know that because these queries are likely to be labeled as literal recall, inferencing, main ideas, supporting details, drawing conclusions, cause and effect – monikers that totally miss the point of the reasons for students’ errors. Those tests offer no direction when it comes to the kinds of instruction that might improve students’ abilities to handle such questions. Having kids practicing with “drawing conclusions” questions won’t cut the mustard.\n\nI think it would be better to explain to readers that people have emotional reactions to events – that some things may make us happy, sad, or angry. Then I’d expose them to a series of stories in which the events elicit such reactions among the characters. At first, I’d model, telling the students how I thought a character reacted and why. Then, I’d guide students to try to infer emotional reactions in other stories, perhaps with some kind of multiple-choice scheme. Then we’d explore what might make someone jealous or hurt their feelings, and so on; again, linking these to the events in the stories the kids are reading. I can imagine some pretty cool graphic organizers identifying character motivations and emotional reactions.\n\nAs with the difficulties in interpreting social cues, the research does a good job of identifying the problem, but experimental instruction targeted specifically on what it is that is hard for these kids just doesn’t exist. Here, however, there have been some small, positive steps suggesting that teaching kids how to use cohesive links may be helpful. That makes sense to me, as would efforts to guide these students to “build up” an understanding of a text: reading a sentence and talking about it, then reading a second, and focusing on its connections with the first, and so on.\n\nKeller?Margulis, M. A., Mire, S. S., Loría Garro, E. S., Jellinek?Russo, E. R., Lozano, I., Hut, A. R., Luu, M.?L. N., Izuno?Garcia, A. K., Erps, K. H., Landry Pierce, L. N., Tan, S. X., McNeel, M. M., Gardner, S. M., & Duran, B. J. (2024). Measuring academic skill development for students with autism spectrum disorder using curriculum?based measurement: A scoping review and call for research. Psychology in the Schools, 61(5), 2132–2147. https://doi.org/10.1002/pits.23154\n\nHow Do We Deal with Fluency Instruction in the Middle and High School? Part 2",
  },
  {
    id: "cap_1786408203617",
    title: "ML systems · WebGPU execution model and kernel design",
    hypothesis:
      "Explains the WebGPU deferred execution model, and the buffer design LlamaWeb uses instead of a pool, but names the quantised KV-cache formats q4_0 and q8_0, FlashAttention, online-softmax and prefill/decode without saying what any of them are. Densest undefined-term passage in the set.",
    category: "undefined-term",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: [
      "q4_0",
      "q8_0",
      "KV cache",
      "FlashAttention",
      "FlashDecoding",
      "online-softmax",
      "prefill",
      "decode",
      "workgroup",
      "push constants",
      "subgroup-matrix",
    ],
    definedInPassage: [
      "WebGPU deferred execution model",
      "pipelines and bind groups",
      "LlamaWeb's single pre-allocated parameter buffer",
    ],
    requiresWorldKnowledge: [
      "A KV cache stores attention keys and values so earlier tokens are not recomputed",
      "q4_0 and q8_0 are integer quantisation formats naming bits per weight",
    ],
    source: {
      url: "https://arxiv.org/html/2605.20706v1#S8",
      capturedAt: "2026-08-11T00:30:03.617Z",
      extensionVersion: "0.4.0",
      licence:
        "arXiv 2605.20706. Licence not verified; the default arXiv licence does not " +
        "grant third-party redistribution. Published here as an attributed " +
        "excerpt for evaluation; removed on request from the rights holder.",
    },
    text: "On the host side, applications interact with the GPU (device) through a structured API. Kernels are compiled at runtime into pipelines, which define both the executable code and the layout of bound resources. Data is stored in buffers allocated by the host and organized into bind groups which are bound to pipelines according to specified bind group layouts. WebGPU follows a deferred execution model; compute workloads are recorded via command encoders and compute passes, but this work does not execute on the GPU until the command encoder is finished, i.e., flushed, into a command buffer, which is in turn submitted to the device queue. Along with command buffers, work like copying data from one buffer to another can be submitted to the queue. The granularity of queue submission, such as how many operations are grouped into a single compute pass or how many commands are in flight in the queue, can affect performance and stability, and application performance can vary across different WebGPU implementations.\n\nEach kernel needs a small number of dynamic parameters, e.g., matrix dimensions, passed in. Unlike in other languages, e.g., using push constants in Vulkan, WebGPU does not yet support a way to directly pass small amounts of data to kernels at runtime, so frameworks like WebLLM and ONNX Runtime maintain pools of small buffers that are dynamically allocated and cached. Though the memory overhead of these pools is small, when pushing against the limits of a device’s memory, allocating a new buffer may be the difference between crashing the page or not. Therefore, LlamaWeb allocates a single buffer at startup with enough slots to fit the parameters for a configurable number of kernels. Within the buffer, we rotate through the slots, and we guarantee that parameters are not overwritten until the kernel that relies on them finishes. This simple design also avoids any synchronization logic needed to maintain a buffer pool, including handling asynchronous callbacks to release buffers, and avoids memory fragmentation.\n\n3.2.Kernel Library and Execution Scheduling\n\nGeneral Purpose Kernels\n\nMatrix Multiplication\n\nFlashAttention\n\nAs attention is one of the central operations in LLM inference, our library implements several variants. Rather than materializing the intermediate QK^T scores and softmax probabilities, these kernels stream over the KV cache in tiles and maintain the online-softmax state directly inside the kernel. The FlashDecoding implementation is optimized for decode; it maps one query row to one workgroup, keeps the row maximum, exponential sum, and output accumulator local to that row, and iterates over cached K/V tiles. The tile path targets larger query chunks, e.g., during prefill, by processing multiple query rows per workgroup and staging Q/K/V tiles in workgroup memory for better reuse. The implementation also contains a subgroup-matrix variant for environments where this experimental WebGPU feature is supported. The backend also supports quantized KV-cache formats such as q4_0 and q8_0 by dequantizing K/V blocks while loading them from global to shared memory in the attention kernel.\n\nLlamaWeb also used less memory than other frameworks on the NVIDIA RTX 5080. Running Chrome on Linux, LlamaWeb used 24% less memory than Transformers.js and 23% less than WebLLM. Running Chrome on Windows, LlamaWeb used 20% less memory than Transformers.js and 61% less than WebLLM. WebLLM memory usage also climbed to around 10 GB on this configuration, most likely due to a memory leak. While total memory usage varies widely based on operating system, browser, and WebGPU backend, LlamaWeb consistently uses the least memory and does not suffer from memory leaks. Together, these results validate the memory-efficient design of LlamaWeb and show that developers must pay close attention to cross-platform memory usage while building applications using WebGPU.\n\n6.Performance Evaluations\n\n6.1.Performance-Portability Across Models and Devices",
  },
  {
    id: "cap_1786408204007",
    title: "ML systems · cross-device throughput",
    hypothesis:
      "Defines its own clusters and the native backends in the figure caption, so most of it is self-contained. What it leaves bare is the weight format q4_k_m, the q1_0 fallback, k-means, and tok/s. Mostly numbers and device names, which makes it the passage where a recap should stay closest to the text — a useful counterweight to the design passage above.",
    category: "undefined-term",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: [
      "q4_k_m",
      "q1_0",
      "\u{1D458} -means",
      "tok/s",
      "KV-cache depth",
    ],
    definedInPassage: [
      "high/mid/low performance clusters",
      "native backends: CUDA, HIP, SYCL, Metal",
    ],
    requiresWorldKnowledge: [
      "q4_k_m is a k-quant mixed-precision format from the llama.cpp family",
    ],
    source: {
      url: "https://arxiv.org/html/2605.20706v1#S8",
      capturedAt: "2026-08-11T00:30:04.007Z",
      extensionVersion: "0.4.0",
      licence:
        "arXiv 2605.20706. Licence not verified; the default arXiv licence does not " +
        "grant third-party redistribution. Published here as an attributed " +
        "excerpt for evaluation; removed on request from the rights holder.",
    },
    text: "(a)Prefill throughput (512-token prompt).\n\n(b)Decode throughput (128 generated tokens).\n\nFigure 4.Median LlamaWeb throughput across all 10 models (Tab. 3) on 16 GPUs from 8 vendors, grouped into three performance clusters via 𝑘 -means.\n\nTo evaluate LlamaWeb’s portability, we run all 10 models in Tab. 3 across every WebGPU-capable device in Tab. 4 with q4_k_m weights (or q1_0 for Bonsai) and depths of 0 and 2048 for the KV-cache. To understand how different GPUs behave and their similarities to one another, we group the devices into three clusters via 𝑘 -means on each device’s log-throughput feature vector across all (model, phase, KV-cache depth) measurements. For more details on the clustering strategy, see App. C.\n\nThe three clusters end up reasonably representing GPU capabilities and performance: the first cluster (high) contains high-end discrete GPUs like the NVIDIA RTX 5080, the second cluster (mid) contains integrated and high-end mobile GPUs like an Apple M2 and Galaxy S24, and the third cluster (low) contains low-power and efficient GPUs from iPhones and Android devices (Adreno, Mali, PowerVR). To our knowledge, this is the largest cross-device, cross-model evaluation of a single browser-based inference engine, and the first to include mobile devices. LlamaWeb runs every model in our suite on devices in the high and mid clusters, while GPUs in the low cluster were only able to fit the four smallest models (lfm, bonsai, gemma3, and qwen3) due to memory constraints.\n\nFigure 4 shows the median prefill and decode tok/s throughput for each model, cluster, and KV-cache depth. Throughput varies by several orders of magnitude due to varied device performance and model size, highlighting how LlamaWeb is able to adapt to the extremely heterogeneous browser landscape. On devices in the high cluster, smaller models reach above 3k tok/s during prefill and 100 tok/s during decode, while dropping to 65 tok/s during prefill and 30 tok/s during decode on the large gemma4 model. Throughput on the low cluster is significantly lower, with decode in the range of 4–17 tok/s, but still shows that capable small models can run even in extremely constrained environments. Our results also show that while increased KV-cache depth has some effect on performance, LlamaWeb is able to scale to handle higher contexts while still achieving reasonable performance. For a more complete breakdown of model performance on every device in our study, see App. D.\n\nFigure 5.Throughput of the llama model across different llama.cpp backends and weight formats. The native backend is CUDA on the NVIDIA GPU, HIP on the AMD GPU, SYCL on the Intel GPU, and Metal on the Apple GPU.\n\n6.2.Native Performance",
  },
  {
    id: "cap_1786408211779",
    title: "Economic history · the Nixon shock",
    hypothesis:
      "Reclassified after reading it. This passage defines the Bretton Woods system, the $35 gold peg and the convertibility suspension in its own words, so there is little for explain mode to add. Kept as a control: if explain mode adds material here, it is padding rather than supplying a missing definition.",
    category: "bounded",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: ["dutiable imports"],
    definedInPassage: [
      "Bretton Woods system",
      "gold convertibility",
      "the Nixon shock",
      "why the dollar was overvalued",
      "New Economic Policy",
    ],
    requiresWorldKnowledge: [],
    source: {
      url: "https://history.state.gov/milestones/1969-1976/nixon-shock",
      capturedAt: "2026-08-11T00:30:11.780Z",
      extensionVersion: "0.4.0",
      licence: "history.state.gov — US federal government work, public domain.",
    },
    text: "MILESTONES: 1969–1976\n\nNixon and the End of the Bretton Woods System, 1971–1973\n\nOn August 15, 1971, President Richard M. Nixon announced his New Economic Policy, a program “to create a new prosperity without war.” Known colloquially as the “Nixon shock,” the initiative marked the beginning of the end for the Bretton Woods system of fixed exchange rates established at the end of World War II.\n\nUnder the Bretton Woods system, the external values of foreign currencies were fixed in relation to the U.S. dollar, whose value was in turn expressed in gold at the congressionally-set price of $35 per ounce. By the 1960s, a surplus of U.S. dollars caused by foreign aid, military spending, and foreign investment threatened this system, as the United States did not have enough gold to cover the volume of dollars in worldwide circulation at the rate of $35 per ounce; as a result, the dollar was overvalued. Presidents John F. Kennedy and Lyndon B. Johnson adopted a series of measures to support the dollar and sustain Bretton Woods: foreign investment disincentives; restrictions on foreign lending; efforts to stem the official outflow of dollars; international monetary reform; and cooperation with other countries. Nothing worked. Meanwhile, traders in foreign exchange markets, believing that the dollar’s overvaluation would one day compel the U.S. government to devalue it, proved increasingly inclined to sell dollars. This resulted in periodic runs on the dollar.\n\nIt was just such a run on the dollar, along with mounting evidence that the overvalued dollar was undermining the nation’s foreign trading position, which prompted President Richard M. Nixon to act. On August 13, 1971, Nixon convened a meeting of his top economic advisers, including Secretary of the Treasury John Connally and Office of Management and Budget Director George Shultz, at the Camp David presidential retreat to consider a program of action. Notably absent from the meeting were Secretary of State William Rogers and President’s Assistant for National Security Affairs Henry Kissinger. After two days of talks, on the evening of August 15, Nixon announced his New Economic Policy in an address to the nation on “The Challenge of Peace.” Asserting that progress in bringing an end to U.S. involvement in the war in Vietnam meant that it was time for Americans to turn their minds to the challenges of a post-Vietnam world, Nixon identified a three-fold task: “We must create more and better jobs; we must stop the rise in the cost of living; we must protect the dollar from the attacks of international money speculators.” To achieve the first two goals, he proposed tax cuts and a 90-day freeze on prices and wages; to achieve the third, Nixon directed the suspension of the dollar’s convertibility into gold. He also ordered that an extra 10 percent tariff be levied on all dutiable imports; like the suspension of the dollar’s gold convertibility, this measure was intended to induce the United States’ major trading partners to adjust the value of their currencies upward and the level of their trade barriers downward so as to allow for more imports from the United States.",
  },
  {
    id: "cap_1786408216109",
    title: "Pharmacology · statins and CYP3A4",
    hypothesis:
      "The one passage in the set that expands CYP3A4 in full, and also expands Cmax and AUC. It still never says what GFJ stands for, and names HMG-CoA reductase, rhabdomyolysis and Ki without explanation. Paired with the saxagliptin passage it shows the same term undefined in one section of an article and defined in another — which is why these lists are per passage.",
    category: "undefined-term",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: [
      "GFJ",
      "HMG-CoA reductase",
      "rhabdomyolysis",
      "myopathy",
      "Ki",
      "CYP2C9",
      "CYP2D6",
    ],
    definedInPassage: ["CYP3A4", "Cmax", "AUC"],
    requiresWorldKnowledge: [
      "GFJ is grapefruit juice",
      "HMG-CoA reductase is the enzyme statins inhibit to lower cholesterol",
    ],
    source: {
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12472979/",
      capturedAt: "2026-08-11T00:30:16.109Z",
      extensionVersion: "0.4.0",
      licence:
        "PMC12472979. Licence not verified. Published here as an attributed excerpt " +
        "for evaluation; removed on request from the rights holder.",
    },
    text: "5. Dietary and Pharmacological Modulators of CYP3A4: Clinical Relevance for Statins and Antidiabetic Drugs\n\n5.1. Lipid-Lowering Drugs and CYP3A4\n\nMost statins are substrates of CYP3A4, making them vulnerable to pharmacokinetic interactions with substances that inhibit or induce this enzyme. Inhibition of CYP3A4 can elevate plasma statin concentrations, heightening the risk of adverse effects such as myopathy and rhabdomyolysis, particularly for statins with low oral bioavailability. Conversely, enzyme induction may reduce drug efficacy. Extensive first-pass metabolism in the liver and intestine contributes to this low bioavailability. Statins are mainly eliminated via biliary excretion, with minimal renal involvement [20,105].\n\n5.1.1. Simvastatin\n\nCYP3A4 plays a predominant role in the metabolism of simvastatin, acting in both hepatic and intestinal tissues. It catalyzes oxidative conversion of the lactone ring into inactive metabolites, limiting the bioavailability of the drug to less than 5% [106,107]. As a result, simvastatin is highly susceptible to interactions with strong CYP3A4 inhibitors, such as ketoconazole, erythromycin, and ritonavir, which markedly elevate plasma concentrations and increase the risk of muscle-related adverse events [106,107].\n\n5.1.2. Atorvastatin\n\nThis statin undergoes extensive metabolism via cytochrome P450 3A4 (CYP3A4), both in the liver and the intestinal mucosa. CYP3A4 converts atorvastatin into active ortho- and para-hydroxylated metabolites, as well as into inactive lactone derivatives. The lactone form has a higher affinity for CYP3A4. This metabolic profile makes atorvastatin vulnerable to interactions with CYP3A4 inhibitors, such as itraconazole, ritonavir, and GFJ, potentially raising systemic drug levels and the risk of adverse effects like myopathy or rhabdomyolysis [109].\n\n5.1.3. Lovastatin\n\nCYP3A4 is primarily responsible for lovastatin’s oxidative metabolism, especially in the intestinal epithelium. This extensive first-pass effect contributes to its low systemic bioavailability, which is less than 5% [115]. Though minor contributions from CYP2C9 and CYP2D6 have been observed in vitro, their role in clinical settings is considered negligible. Due to its reliance on CYP3A4, co-administration with potent inhibitors such as erythromycin, ketoconazole, or GFJ may substantially increase plasma concentrations, elevating the risk of muscle-related adverse events, including rhabdomyolysis [20,114].\n\n5.1.4. Cerivastatin\n\nCerivastatin is a synthetic and enantiomerically pure statin administered in its active acid form. It possesses exceptionally high potency as an HMG-CoA reductase inhibitor, with a Ki of approximately 1.3 nM, allowing therapeutic efficacy at microgram-level doses [117]. After oral intake, cerivastatin is rapidly and completely absorbed, achieving peak plasma concentrations within 2 to 3 h. It displays linear pharmacokinetics, with dose-proportional increases in maximum plasma concentration (Cmax) and area under the concentration–time curve (AUC). More than 99% of the circulating drug is bound to plasma proteins. Its moderate volume of distribution reflects limited tissue penetration but a preferential accumulation in hepatic tissue, the primary site of action [118].\n\n5.2. Antidiabetic Drugs and CYP3A4\n\nThe relevance of CYP3A4 in the pharmacokinetics of antidiabetic agents lies in its susceptibility to both inhibition and induction, processes that can dramatically alter the plasma concentrations and therapeutic efficacy of these drugs [122,123]. In clinical practice, this is especially relevant because patients with type 2 diabetes mellitus often receive multiple medications for comorbidities such as dyslipidemia, hypertension, and cardiovascular disease [124], increasing the risk of drug–drug interactions [125] and interindividual variability due to genetic polymorphisms affecting CYP3A4 expression or function.",
  },
  {
    id: "cap_1786408216441",
    title: "Pharmacology · repaglinide",
    hypothesis:
      "Expands SUR1 and describes OATP1B1 as a hepatic uptake transporter, but leaves the CYP isoforms, the SLCO1B1 variant notation and AUC unexplained. The gemfibrozil interaction is stated with its mechanism, so a recap can carry it without world knowledge — useful as a check that recap mode is not being credited for knowledge it did not need.",
    category: "undefined-term",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: [
      "CYP2C8",
      "CYP2C9",
      "CYP3A4",
      "SLCO1B1",
      "rs4149056",
      "AUC",
      "meglitinide",
      "sulfonylureas",
    ],
    definedInPassage: [
      "SUR1",
      "OATP1B1",
      "ATP-sensitive potassium channel mechanism",
    ],
    requiresWorldKnowledge: [
      "CYP2C8 and CYP3A4 are cytochrome P450 isoforms",
      "AUC is area under the concentration-time curve",
    ],
    source: {
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12472979/",
      capturedAt: "2026-08-11T00:30:16.441Z",
      extensionVersion: "0.4.0",
      licence:
        "PMC12472979. Licence not verified. Published here as an attributed excerpt " +
        "for evaluation; removed on request from the rights holder.",
    },
    text: "Several oral antidiabetic agents are known to be substrates of CYP3A4. These include troglitazone [5,126], linagliptin [127], and pioglitazone [128,129], among others. In some cases, CYP3A4 is the primary metabolic route, while in others, it acts in concert with other isoenzymes such as CYP2C8 [130] or CYP2C9 [3]. For instance, pioglitazone is primarily metabolized by CYP2C8, but CYP3A4 also plays a secondary role [131]. Similarly, repaglinide is biotransformed mainly by CYP2C8 and CYP3A4 [130], and saxagliptin is extensively metabolized by CYP3A4/5 [132].\n\nMechanistically, repaglinide stimulates insulin secretion by binding to and inhibiting ATP-sensitive potassium channels on the pancreatic β-cell membrane [142]. This results in membrane depolarization and opening of voltage-gated calcium channels, leading to an influx of calcium and subsequent exocytosis of insulin-containing granules [143]. Unlike sulfonylureas, repaglinide exhibits rapid dissociation from the sulfonylurea receptor 1 (SUR1) subunit of the K-ATP channel, which may reduce the risk of prolonged hypoglycemia and allow for a more flexible dosing regimen based on meals [144].\n\nCYP2C8 is the dominant enzyme responsible for the formation of the active metabolite M4, while CYP3A4 predominantly generates M1 and other minor metabolites [130]. This dual metabolic pathway renders repaglinide susceptible to interactions with drugs that inhibit or induce either enzyme. In particular, the glucuronide metabolite of clopidogrel is a strong CYP2C8 inhibitor and significantly increases repaglinide plasma concentrations, elevating the risk of hypoglycemia [147]. Similarly, gemfibrozil, a lipid-lowering agent, inhibits both CYP2C8 and the hepatic uptake transporter OATP1B1, leading to an 8-fold increase in repaglinide exposure [148]. Given this dual enzymatic pathway, the potential for pharmacokinetic interactions with CYP2C8 and CYP3A4 inhibitors is clinically significant. Notably, concomitant use of repaglinide and gemfibrozil is contraindicated due to a markedly increased risk of hypoglycemia.\n\nAdditionally, cyclosporine, a known inhibitor of both CYP3A4 and OATP1B1, markedly increased repaglinide plasma concentrations in healthy volunteers (by 2.4-fold in AUC). This pharmacokinetic interaction was significantly modulated by SLCO1B1 polymorphisms (e.g., rs4149056), with a reduced effect observed in individuals carrying the 521TC genotype, compared to those with the 521TT reference genotype [151]. These findings highlight the importance of considering both metabolic enzymes and transporters when predicting pharmacokinetic interactions.\n\nNateglinide is another member of the meglitinide class of oral antidiabetic agents, sharing structural and mechanistic similarities with repaglinide [152]. As previously described for this drug class, nateglinide promotes glucose-dependent insulin secretion by targeting ATP-sensitive potassium channels on pancreatic β-cells via interaction with the SUR1 subunit [144]. However, compared to repaglinide, nateglinide has an even faster onset and shorter duration of action, leading to a more pronounced early-phase insulin release, which is particularly effective in attenuating postprandial hyperglycemia [153].\n\nIn contrast to repaglinide, which is also influenced by CYP2C8 and hepatic uptake transporters such as OATP1B1, nateglinide exhibits a more limited interaction profile [156]. Nevertheless, coadministration with strong CYP inducers like rifampicin has been shown to reduce its bioavailability and compromise its efficacy [4]. Rifampicin significantly accelerates nateglinide clearance, likely through simultaneous induction of both CYP3A4 and CYP2C9 [157]. In contrast, coadministration with CYP inhibitors such as clarithromycin has shown minimal effect on nateglinide exposure, whereas potent inhibitors like fluconazole and miconazole significantly increase its plasma levels due to strong inhibition of CYP2C9 and CYP3A4 [158].",
  },
  {
    id: "cap_1786408216741",
    title: "Pharmacology · saxagliptin",
    hypothesis:
      "Defines DPP-4, GLP-1, GIP and SGLT2 itself, so those cannot separate the backends. What it never expands is GFJ — used as a CYP3A4 inhibitor three sections running — and CYP3A4 itself, which this section names but only the statins section expands. A correct explain answer supplies those; a correct recap cannot.",
    category: "undefined-term",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: ["GFJ", "CYP3A4", "T2DM"],
    definedInPassage: ["DPP-4", "GLP-1", "GIP", "incretin", "SGLT2"],
    requiresWorldKnowledge: [
      "GFJ is grapefruit juice",
      "CYP3A4 is a cytochrome P450 enzyme",
    ],
    source: {
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12472979/",
      capturedAt: "2026-08-11T00:30:16.741Z",
      extensionVersion: "0.4.0",
      licence:
        "PMC12472979. Licence not verified. Published here as an attributed excerpt " +
        "for evaluation; removed on request from the rights holder.",
    },
    text: "5.2.3. Saxagliptin\n\nThe therapeutic mechanism of saxagliptin involves the inhibition of the enzyme DPP-4, a serine protease that rapidly inactivates incretin hormones such as glucagon-like peptide-1 (GLP-1) and glucose-dependent insulinotropic peptide (GIP) [160]. These incretins play a crucial role in maintaining glucose homeostasis by stimulating insulin secretion from pancreatic β-cells and suppressing glucagon release from α-cells in a glucose-dependent manner. By prolonging the activity of endogenous incretins, saxagliptin enhances postprandial insulin response and reduces hepatic glucose production, thereby improving both fasting and postprandial plasma glucose levels [160].\n\nIn a recent in vitro study, Liu et al. [163] confirmed that CYP3A4 plays a central role in the oxidative metabolism of saxagliptin. By evaluating the catalytic efficiency of 27 CYP3A4 variants, the authors observed substantial differences in enzymatic activity, with many variants showing a 1.9–7% reduction in intrinsic clearance compared to the wild type [163]. These polymorphisms may lead to slower metabolism, higher parent drug concentrations, and a potential increased risk of adverse effects such as hypoglycemia, especially in combination regimens [163].\n\nGiven its reliance on CYP3A4-mediated metabolism, saxagliptin may also be affected by dietary constituents known to inhibit this enzyme, such as GFJ or certain herbal supplements. Clinical pharmacology data show that moderate CYP3A4 inhibitors like GFJ can increase saxagliptin exposure, though current guidance does not mandate dose adjustments [166,167]. However, clinical studies evaluating such interactions remain limited, and current guidelines do not mandate routine avoidance of these foods in patients receiving saxagliptin.\n\n5.2.4. Canagliflozin\n\nIn addition to DPP-4 inhibitors, other antidiabetic classes, such as SGLT2 inhibitors, may also be subject to CYP3A4-mediated metabolic modulation, albeit to a lesser extent. Canagliflozin is a sodium–glucose cotransporter 2 (SGLT2) inhibitor that has been approved for the management of T2DM and is increasingly recognized for its pleiotropic benefits. Its mechanism of action is independent of insulin secretion and involves inhibiting glucose reabsorption in the proximal renal tubules, thereby increasing glucosuria and improving glycemic control [168]. Notably, it reduces fasting and postprandial glucose without increasing the risk of hypoglycemia [169].\n\nCanagliflozin has demonstrated cardiovascular and renal protective effects, which are thought to be mediated not only by glucose-lowering but also by additional mechanisms such as reductions in systolic blood pressure (−3.93 mmHg), body weight (−1.6 kg), and albuminuria [170]. Neal et al. also reported improved lipid profiles and a decreased need for other glucose-lowering agents. Moreover, Polidori et al. [171] observed significant improvements in beta-cell glucose sensitivity and insulin secretion rates in patients treated with canagliflozin, suggesting a recovery of pancreatic function likely due to reduced glucotoxicity.\n\nIn terms of elimination, canagliflozin exhibits a dual excretion pathway: approximately 60% of the administered dose is excreted in feces, primarily as unchanged drug (41.5%) due to incomplete absorption and biliary secretion of glucuronidated metabolites (M7, M5), which undergo intestinal hydrolysis back to the parent compound. Renal excretion accounts for 33% of the dose, predominantly as inactive O-glucuronide metabolites (M5: 13.3%, M7: 17.2%), with less than 1% excreted as intact canagliflozin. The drug’s low renal clearance (0.049–0.13 L/h) reflects its high plasma protein binding (98–99%) and minimal active tubular secretion [174].",
  },
  {
    id: "cap_1786408229442",
    title: "AI · pre-training timelines (b)",
    hypothesis:
      "A second slice of the same article, roughly eighty per cent shared text with (a) plus the self-reported-identity section. Retained only to show that two overlapping slices of one page are not independent evidence; a replacement from a different source would serve the corpus better.",
    category: "bounded",
    lang: "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    undefinedTerms: [
      "frontier model",
      "teacher model",
      "recency-biased dataset",
    ],
    definedInPassage: [
      "pre-training checkpoint",
      "post-training",
      "distillation",
      "knowledge cutoff",
    ],
    requiresWorldKnowledge: [],
    source: {
      url: "https://blog.sshh.io/p/exploring-claudegpt-knowledge-cutoffs",
      capturedAt: "2026-08-11T00:30:29.442Z",
      extensionVersion: "0.4.0",
      licence:
        "blog.sshh.io. Personal blog, no licence stated, so all rights reserved. " +
        "Published here as an attributed excerpt for evaluation; removed on " +
        "request from the rights holder.",
    },
    text: "Exploring Claude/GPT Knowledge Cutoffs & Pre-training Timelines\n\nAn analysis of what models know and what it tells us about how they were trained.\n\nEverything here is an estimate. It’s possible that some speculation in this post is totally incorrect given there’s not a ton of publicly available ground truth to verify against.\n\nHow frontier models are trained\n\nWhile increasingly more compute is spent on post-training for boosting a model’s reasoning and problem solving, one of the most expensive and data-intensive steps is generating that pre-training checkpoint (by ‘checkpoint’ think of a massive claude-super-secret-2026-11-01-base.cpkt file).\n\nWhile that’s happening, the “capability” and “post-training” teams will run experiments for how to improve on the most recent base model. Advancements in post-training and capabilities often manifest as minor versions of released models. These teams often also “distill” a single post-trained model into smaller variants that become model families (Fable/Opus/Sonnet/Haiku, Sol/Terra/Luna). Labs may also release post-trained models from half-baked pre-training checkpoints as soon as x% of the version N+1 checkpoint is better than the 100% baked version N checkpoint.\n\nModel Knowledge Timelines\n\nTo estimate the pre-training checkpoint dates, I constructed a dataset of daily-facts from Wikipedia (e.g. 2025 in the United States) and gave every model an 8-way multiple choice quiz on what happened on a given day. Then, by analyzing the error rate timeline, you can see roughly when it loses signal from its training dataset.\n\nAnthropic models Opus 4.7 onwards are all from the same training run that cuts off just around late December 2025. This is derived from how they all share a very similar effective knowledge cutoff (green). A core assumption I’m making here is that the pre-training base model completion date is highly correlated with the dataset timespan used, if that’s wrong these results could be off by some offset (e.g. it’s actually Jan 2026). It’s also interesting that Opus 4.7+ models all have a published reliable and overall knowledge cutoff that’s identical — maybe that’s due to a new post-training technique being used?\n\nInterpreting this graph as X = “pre-training corpus” and Y = “post-trained behavior”, these vertical strips (X constant, Y increasing) visualize active post-training on recency-biased datasets. Potentially distillation from old copies of teacher models is what causes smaller models to self-report older dates.\n\nSelf-reported Identity\n\nYou can also make predictions on training timelines and datasets indirectly by looking at who the models think they are. The more a model sees “I am X” in its pre-training dataset, the more likely it is to repeat that when pushed and given no other grounding context.\n\nFull dataset. Each row is a real model; each column is a self-claimed identity extracted from 50 “what model are you?” probes (5 phrasings × 10 samples, guess-nudged, no system prompt). Cell shade = share of the model's replies claiming that name; green outline = the claim matches the model's true family (bold outline = exact version — which never happened. Some more neat visuals.\n\nVertical bands show clear patterns of labs training on past-model outputs (from users). For OpenAI it’s GPT-4, GPT-4o, GPT-4.1 for a bit, GPT-5 and “ChatGPT” most recently. For Anthropic it’s 3.5 Sonnet then more recent models swap to Sonnet 4.5. This seems to align pretty well with training on chats from ChatGPT.com and Claude.ai respectively, where users chatted with the latest model and whose sessions became training material (directly or via web contamination). It seems unlikely to me these are coming from internal synthetic datasets given those would be much easier to suppress model identity (vs being embedded in the system prompt in the consumer chat sessions). Training-on-chats isn’t novel information but it is interesting to see expressed literally with probing like this.",
  },
];

export const demoFixtures = () => FIXTURES.filter((f) => f.demo);

/** What content.ts stores after each real flick. */
export interface Capture {
  id: string;
  url: string;
  pageTitle: string;
  heading: string;
  lang: string;
  skippedPx: number;
  chars: number;
  capturedAt: string;
  text: string;
}

/* The page also has to run outside the extension — served over http it can
   render an exported result for a writeup, and there is no chrome.* there. */
const inExtension = () =>
  typeof chrome !== "undefined" && !!chrome.storage && !!chrome.runtime?.id;

export const extensionVersion = () =>
  inExtension() ? chrome.runtime.getManifest().version : "n/a";

export function loadCaptures(): Promise<Capture[]> {
  if (!inExtension()) return Promise.resolve([]);
  return new Promise((resolve) => {
    chrome.storage.local.get("skimRecapCaptures", (res) => {
      resolve(
        Array.isArray(res.skimRecapCaptures)
          ? (res.skimRecapCaptures as Capture[])
          : [],
      );
    });
  });
}

export const clearCaptures = () => {
  if (inExtension()) chrome.storage.local.remove("skimRecapCaptures");
};

/** Lets a capture be compared immediately, before anyone has decided what it
 *  is for. Runs both modes, since which one discriminates is the question. */
export function captureAsFixture(c: Capture): Fixture {
  return {
    id: c.id,
    title: c.heading || c.pageTitle || c.url,
    hypothesis: "(unclassified capture)",
    category: "bounded",
    lang: c.lang || "en",
    targetLang: "",
    modes: ["recap", "feynman"],
    source: { url: c.url, capturedAt: c.capturedAt, extensionVersion: "" },
    text: c.text,
  };
}

/** Emits a paste-ready `src/fixtures.ts` entry, so a capture worth keeping
 *  becomes a permanent, reviewable part of the corpus rather than living in
 *  browser storage. */
export function captureToSource(c: Capture, version: string): string {
  const esc = (s: string) => JSON.stringify(s);
  return `  {
    id: ${esc(c.id)},
    title: ${esc(c.heading || c.pageTitle)},
    // TODO Read the passage before filling the four fields below. Writing them
    // from the subject area is how the first corpus ended up with three
    // pharmacology fixtures sharing one sentence, one of which described its
    // passage wrongly. The text is right here; check against it.
    hypothesis: 'TODO — what does this passage decide, that the others do not?',
    category: 'undefined-term',
    lang: ${esc(c.lang || "en")},
    targetLang: '',
    modes: ['recap', 'feynman'],
    // TODO Terms this passage names and never explains.
    undefinedTerms: [],
    // TODO Terms this passage names AND explains. If every term lands here,
    // the passage cannot discriminate between backends — drop it.
    definedInPassage: [],
    // TODO Facts a correct feynman answer must supply that the passage omits.
    requiresWorldKnowledge: [],
    source: {
      url: ${esc(c.url)},
      capturedAt: ${esc(c.capturedAt)},
      extensionVersion: ${esc(version)},
      // TODO Licence of the source page. The corpus is published, so where the
      // licence does not permit redistribution, store the URL, the character
      // offsets and a sha256 of the text instead, and say so here.
      licence: 'TODO',
    },
    text: ${esc(c.text)},
  },`;
}
