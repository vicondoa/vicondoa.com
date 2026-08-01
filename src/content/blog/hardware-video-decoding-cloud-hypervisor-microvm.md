---
title: 'Hardware Video Decoding in a Cloud Hypervisor microVM on an NVIDIA T1000'
description: 'I wanted Firefox in a microVM to render and decode video on my desktop GPU without patching Firefox. Getting there meant building Vulkan Video support into Venus, and the last bug was one plane of an NV12 frame.'
publishedAt: 2026-07-31
topics:
  - Virtualization
  - Graphics
  - Programming
draft: true
---

I wanted to experiment with getting a Cloud Hypervisor microVM to use the
NVIDIA T1000 in my desktop for hardware-accelerated video decoding. The goal
was to run Firefox inside the microVM and have both rendering and video
decoding happen on the host GPU instead of falling back to software decoding in
the guest.

There was a constraint underneath that goal which ended up shaping the whole
project. I already had a working decode path, and it required a forked Firefox.
Firefox ships security patches constantly, and a fork means rebasing on every
release forever. I did not want to maintain that. So the real target was not
just hardware decode. It was hardware decode with a completely unmodified
browser.

I got there. Stock upstream Firefox now runs inside a Cloud Hypervisor microVM,
renders through the host T1000, and decodes H.264 on the host NVDEC engine using
Vulkan Video. From Firefox's point of view it is calling ordinary Vulkan. Every
change that makes it work lives underneath the browser, in guest Mesa and host
virglrenderer.

## Getting the GPU into Cloud Hypervisor at all

Cloud Hypervisor has no way to expose a `virtio-gpu` device. The first problem
was therefore not video at all, it was getting any GPU into the guest.

[Spectrum OS](https://spectrum-os.org/software/cloud-hypervisor/) maintains a
patch set against Cloud Hypervisor that adds one. I vendored it rather than
using microvm.nix's `cloud-hypervisor-graphics` overlay, because the overlay
pulls its source from spectrum-os.org's git server, which consistently truncates
snapshot tarballs and fails full clones. The individual patch files come down
fine from the cgit `/plain/` endpoint, so vendoring them is smaller and more
reproducible than depending on that server being healthy. The set is a handful
of Cloud Hypervisor patches plus `rust-vmm/vhost` backports that the
shared-memory regions need.

That patch adds the device but not a backend. For the backend I used
[crosvm](https://crosvm.dev/), Google's VMM for ChromeOS. I had no interest in
crosvm as the VMM. I wanted exactly one thing out of it: its `vhost-user-gpu`
device, which talks to the host graphics driver through `rutabaga_gfx` and
`virglrenderer`. Cloud Hypervisor runs the VM, crosvm runs as a sidecar process
holding the GPU, and the two speak vhost-user over a socket.

The launcher wires it up like this:

```sh
crosvm device gpu \
  --socket "$RUN_DIR/gpu.sock" \
  --wayland-sock "$WAYLAND_SOCK" \
  --gpu-device-node /dev/dri/renderD128 \
  --params '{"context-types":"virgl2:venus","implicit-render-server":true,"external-blob":true}' &

cloud-hypervisor \
  --gpu "socket=$RUN_DIR/gpu.sock" \
  ...
```

`--gpu-device-node` is not upstream. It is a small patch I carry that lets the
GPU sidecar be handed a DRM render node, which virglrenderer's video code needs
later.

With that in place, page rendering happened on the GPU. Firefox was compositing
through the NVIDIA T1000 on the host. That was an exciting milestone, and it was
also where the easy part ended. Video still decoded entirely in software inside
the guest.

## The V4L2 path, which worked and which I want to delete

The first decode path I got working went through V4L2. It is not the API you
would expect to reach for here, but it was the shortest route to something that
actually decoded.

I patched crosvm to expose a `virtio-media` device and patched Cloud Hypervisor
to accept and forward it. The full chain looks like this:

```text
guest ffmpeg h264_v4l2m2m
  -> /dev/video*
  -> guest virtio_media driver
  -> patched Cloud Hypervisor --vhost-user-media
  -> patched crosvm device video-decoder --backend vaapi
  -> host VA-API through a closed device allowlist
```

It works. It also has two problems.

The first is that decode is a completely separate path from rendering. Decoded
frames come back through a different device than the one doing the compositing,
so they are not first-class GPU images on the same device as everything else.

The second problem is the one that mattered. Firefox does not use this path.
Firefox's Linux hardware decode is VA-API, and its V4L2 decoder is gated at
build time:

```python
# toolkit/moz.configure
MOZ_ENABLE_V4L2  # gated to target.cpu in ("arm", "aarch64", "riscv64")
```

To make Firefox use it I had to fork the browser. My
[firefox-v4l2-nvidia](https://github.com/vicondoa/firefox-v4l2-nvidia) fork
carries the patches that get there:

- [`moz.configure: enable V4L2 decoder on x86_64`](https://github.com/vicondoa/firefox-v4l2-nvidia/commit/c0b5eb282)
- [`ffmpeg: prioritize V4L2 decoder over VA-API`](https://github.com/vicondoa/firefox-v4l2-nvidia/commit/82633c0ad)
- [`ffmpeg: force H.264 hardware decode (bypass gfxVars check)`](https://github.com/vicondoa/firefox-v4l2-nvidia/commit/87a31ce84)
- [`FFmpegDecoderModule: expose V4L2 support detection`](https://github.com/vicondoa/firefox-v4l2-nvidia/commit/0e110bf21)

Three of those patches exist only to defeat gates that upstream put there on
purpose. That is a fork I have to rebase every few weeks, forever, on a browser
whose whole release cadence is driven by security fixes. Every rebase is a
chance to silently break a security patch. This is the thing I set out to
delete.

## The VA-API dead end, and why it is architectural

The obvious alternative was to make VA-API work through the GPU path instead,
since VA-API is what Firefox actually looks for. virglrenderer has video support.
It is even built with it. I spent a long time on this and it does not work, and
the reason turned out to be worth writing down.

The guest's `virtio_gpu` VA driver loaded, initialised, and then advertised zero
H.264 profiles. That reads like a missing host capability. It is not. I measured
it in order, each question cheap and each one narrowing the next:

| Question                                                       | Answer                        |
| -------------------------------------------------------------- | ----------------------------- |
| Does the host do VA-API H.264 at all?                          | Yes, via NVDEC direct backend |
| Does it still work inside the crosvm sidecar's exact bind set? | Yes, identical                |
| Is virglrenderer built with video?                             | Yes, `-Dvideo=true`           |
| Does rutabaga supply the `get_drm_fd` callback video needs?    | Yes                           |
| Does anything pass `VIRGL_RENDERER_USE_VIDEO`?                 | **No**                        |

That last row is the entire defect. `VIRGL_RENDERER_USE_VIDEO` is bit 11 of the
flags word `virgl_renderer_init()` takes. `rutabaga_gfx` generates the constant
into `src/generated/virgl_renderer_bindings.rs` and then references it nowhere.
Its `VirglRendererFlags` builder stops at bit 10, exposes no `use_video()`, and
keeps the inner `u32` private, so crosvm cannot set the bit even on purpose.

The failure is silent because of where it lands. `virgl_video_init()` is what
assigns `va_dpy`, and `virgl_video_fill_caps()` returns `-1` immediately on a
NULL `va_dpy`. The virgl2 capset reaches the guest with `num_video_caps = 0` and
nothing anywhere reports an error. A guest driver that loads cleanly and
advertises nothing is indistinguishable from a host that cannot decode.

Forcing the bit on exposed a second refusal, and this one is a string compare:

```text
INFO   VA-API version: 1.24
INFO   Driver version: VA-API NVDEC driver [direct backend]
ERROR  only supports mesa va drivers now
```

`virgl_video_init()` rejects every VA driver whose vendor string lacks
`Mesa Gallium`. I overrode that on the reading that it looked conservative,
since the one host API this path needs is `vaExportSurfaceHandle()` with
`VA_SURFACE_ATTRIB_MEM_TYPE_DRM_PRIME_2`, which is standard and which
`nvidia-vaapi-driver` implements already.

That reading was wrong, and I only found out because I measured it.

With video forced on, the guest advertised three H.264 profiles and decode
appeared to work. Then I ran the same clip on both stacks:

| Decode                     |  Frames | Speed |           Host NVDEC |
| -------------------------- | ------: | ----: | -------------------: |
| Host-native VA-API         |  72,180 |   46x |           **94-98%** |
| Guest VA-API through virgl | 135,090 |  264x | **0%, every sample** |

The guest path ran 5.7 times faster than the real hardware decoder while
reporting zero decode errors. Nothing beats the decode engine by 5.7x while
using it. Counting the virgl decode path directly found where it terminates:

```text
VIRGL-VIDEO-EVIDENCE decode_bitstream=2048 failed=0 last_err=0
ERROR  end picture failed, err = 0x17
```

`0x17` is `VA_STATUS_ERROR_DECODING_ERROR`. Every `vaCreateBuffer` and
`vaRenderPicture` succeeds and `vaEndPicture`, the call that actually commits
the decode, is rejected for every frame. The driver's own log names it:

```text
nvEndPicture cuvidDecodePicture failed: 1
```

`1` is `CUDA_ERROR_INVALID_VALUE`. virglrenderer's `h264_fill_slice_param()`
sets two fields and leaves the rest commented out:

```c
//vasp->slice_data_size;
//vasp->slice_data_offset;
//vasp->slice_data_flag;
//vasp->slice_data_bit_offset;
//vasp->first_mb_in_slice;
//vasp->slice_type;
ITEM_SET(vasp, desc, num_ref_idx_l0_active_minus1);
ITEM_SET(vasp, desc, num_ref_idx_l1_active_minus1);
```

That looks like laziness. It is not. The data is not on the wire. The protocol's
`virgl_h264_picture_desc` carries exactly one slice-related field:

```c
uint32_t slice_count;
```

A count. No per-slice size, offset, type, or first macroblock. The virgl video
protocol was designed against Mesa's VA drivers, which hand the bitstream to
hardware that parses slice headers itself. NVDEC does not re-parse.
`nvidia-vaapi-driver` builds `CUVIDPICPARAMS` from the VA slice parameters, gets
zeros where offsets and sizes belong, and `cuvidDecodePicture` correctly rejects
it.

So upstream's "only supports mesa va drivers now" is an accurate statement about
what the protocol can express, not an unreviewed leftover. Lifting it means
extending the virgl video wire format to carry per-slice parameters, across
guest Mesa and virglrenderer, for every codec. That is a protocol change, not a
patch. I stopped and wrote down the blocker instead of inventing a second
architecture around it.

## The insight that made Vulkan the answer

While I was failing at VA-API, Firefox shipped a complete Vulkan Video decoder.
And `MOZ_ENABLE_VULKAN_VIDEO` is compiled in unconditionally for every GTK
build:

```python
# toolkit/moz.configure
set_config("MOZ_ENABLE_VULKAN_VIDEO", True, when=toolkit_gtk)
```

Compare that to the V4L2 line I had been patching, which is gated to
`target.cpu in ("arm", "aarch64", "riscv64")`. One of these needs a fork and one
does not.

`SelectVulkanDecoderPhysicalDevice()` hard-gates on exactly two things being
present: `VK_KHR_video_queue` and `VK_KHR_video_decode_queue`. Venus advertises
neither, so Firefox silently falls back to VA-API and then to software.

That is the whole thing. The browser needs no changes at all. Every piece of
missing work is below it:

```text
stock Firefox (guest)
  -> libavcodec.so.62  (ffmpeg 8, --enable-vulkan)
       -> AV_HWDEVICE_TYPE_VULKAN -> VK_KHR_video_decode_h264
            -> Mesa Venus ICD (guest)          <- add extension exposure
                 -> virtio-gpu / crosvm        <- unchanged, forwards bytes
                      -> virglrenderer (host)  <- add vkr_video.c
                           -> NVIDIA Vulkan ICD -> T1000 NVDEC4
```

crosvm and rutabaga need no changes for this. They forward bytes without
inspecting them, which is exactly what you want in the middle of a protocol you
are extending.

Nothing existed at either end. I verified that by direct source inspection
rather than assuming:

| Layer                  | State before this work                                                        |
| ---------------------- | ----------------------------------------------------------------------------- |
| venus-protocol         | zero video extensions in `VK_XML_EXTENSION_LIST`, no wire commands            |
| virglrenderer          | no `vkr_video.c`; `vkr_extension_table` strips video before the guest sees it |
| Mesa Venus             | no video passthrough, and actively strips video format-feature bits from NV12 |
| upstream MRs in flight | none, in any of the three                                                     |

## Building it across three forks

The work splits cleanly across three projects, each forked with a `base/<rev>`
tag at its seed commit and doing its work on a `vulkan-video` branch so it stays
rebaseable and upstreamable.

| Upstream               | Fork                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `virgl/venus-protocol` | [vicondoa/venus-protocol-vulkan-video](https://github.com/vicondoa/venus-protocol-vulkan-video)           |
| `virgl/virglrenderer`  | [vicondoa/virglrenderer-venus-vulkan-video](https://github.com/vicondoa/virglrenderer-venus-vulkan-video) |
| `mesa/mesa`            | [vicondoa/mesa-venus-vulkan-video](https://github.com/vicondoa/mesa-venus-vulkan-video)                   |

### The wire protocol

Venus serializes Vulkan calls into a command stream. Command IDs are explicitly
assigned in `VK_EXT_command_serialization.xml`, not derived from position, and
`VN_WIRE_FORMAT_VERSION` must not change because Venus requires exact guest and
renderer equality. At the base revision, 345 command types were assigned. The
thirteen H.264 video commands append at 346 through 358, and no existing value
moves.

The commits that build it:
[`venus: add H.264 Vulkan Video extensions to the protocol list`](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/956d64c4c),
[`venus: add field-level StdVideo H.264 definitions and flag packing`](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/60f3e3e7d),
[`venus: serialize the H.264 codec structs`](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/6d8934d05),
and [`venus: cap guest-controlled H.264 array counts`](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/205da3fe3).

That last one matters more than it looks. Every array count in a video struct
arrives from the guest, which is untrusted. Capping them is the difference
between a protocol extension and a way out of the VM.

### The guest driver

Mesa's Venus ICD gets the video entrypoints in
[`src/virtio/vulkan/vn_video.c`](https://github.com/vicondoa/mesa-venus-vulkan-video/blob/vulkan-video/src/virtio/vulkan/vn_video.c):

```c
vn_GetPhysicalDeviceVideoCapabilitiesKHR()
vn_GetPhysicalDeviceVideoFormatPropertiesKHR()
vn_CreateVideoSessionKHR()
vn_DestroyVideoSessionKHR()
vn_GetVideoSessionMemoryRequirementsKHR()
vn_BindVideoSessionMemoryKHR()
vn_CreateVideoSessionParametersKHR()
vn_UpdateVideoSessionParametersKHR()
vn_DestroyVideoSessionParametersKHR()
```

plus the four command-buffer entrypoints in `vn_command_buffer.c`:
`vn_CmdBeginVideoCodingKHR()`, `vn_CmdEndVideoCodingKHR()`,
`vn_CmdControlVideoCodingKHR()`, and `vn_CmdDecodeVideoKHR()`.

Exposure is deliberately conditional on the renderer. The extension bits are set
only alongside a `renderer_extensions.KHR_video_queue` check, and
`VkQueueFamilyVideoPropertiesKHR` is chained into the queue family query so a
guest sees per-family codec operations rather than a video queue that decodes
nothing. Decode only, H.264 only. Encode is not exposed.

### The host renderer

virglrenderer gets a new
[`src/venus/vkr_video.c`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/blob/vulkan-video/src/venus/vkr_video.c),
about 540 lines, plus three headers that are the interesting part:
`vkr_video_validate.h`, `vkr_video_reject.h`, and `vkr_video_scrub.h`. Those
validate the decode scope, DPB slots, capabilities and command sequence on the
way in, and scrub reply payloads on the way out.
[`venus: scrub the video format query reply flags`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/a5e86c4cd)
and
[`venus: zero output pNext payloads on the format-query reject`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/c44f6e50a)
are both about not leaking host state back to the guest on a path that failed.

At this point decode worked. `vkCmdDecodeVideoKHR` fired, sessions were created,
and the host NVDEC engine showed activity. It took months to get here and it was
not the hard part.

## The green frame

Firefox played about half a second of video and then showed a flat dark green
rectangle.

Decode was fine. Presentation was broken, and separating those two took an
embarrassing amount of time. Decode is Vulkan, through Venus. Presentation is
GL, through virgl: the decoded frame is exported as a dmabuf and re-imported as
GL textures for the compositor. Everything that was wrong lived on the second
path, and "decode works" stayed true throughout.

A decoded NV12 frame is one multi-planar `VkImage` backed by one
`VkDeviceMemory`, because `vkCmdDecodeVideoKHR` takes a single
`dstPictureResource`:

```text
offset 0        luma    1280x720, one byte per texel,  stride 1280
offset 983040   chroma   640x360, two bytes per texel, stride 1280
```

983040 is 1280x768. The luma plane is padded to a 768-row alignment before
chroma begins, so chroma starts beyond the end of luma's own extent of 921600
bytes. That detail matters later.

This shape is not negotiable. Two separate images breaks decode. Disjoint planes
via `VK_IMAGE_CREATE_DISJOINT_BIT` would work but `DISJOINT` appears nowhere in
ffmpeg's `hwcontext_vulkan.c`. And changing the client is the thing I am
refusing to do.

Firefox imports the two planes separately, one EGL image each, which is the
portable approach that works on every native driver. Its own log says so:

```text
Plane 0: fd=108 pitch=1280 format=0x20203852 (R8)   size=1280x720
  Plane 0: zero-copy EGLImageTargetTexture2D succeeded
Plane 1: fd=129 pitch=1280 format=0x38385247 (GR88) size=640x360
  Plane 1: zero-copy EGLImageTargetTexture2D succeeded
```

Every field is correct and both imports report success. The two fds refer to
regions of one buffer, so in the guest they resolve to the same GEM handle. Four
separate defects sat between that and a correct picture.

**1. The plane index did not survive the import.**
`virgl_drm_winsys_resource_create_handle()` caches imported buffer objects by
GEM handle. Both planes hit the same cache entry and nothing recorded which
plane each import was, so every plane presented as plane 0 of a fresh buffer.
That index is load bearing: `virgl_encode.c` writes `res->metadata.plane` into
the field virglrenderer reads to select a per-plane image. Fixed by recording
import offsets per buffer object in first-seen order, where the index of an
offset is the plane index.

**2. The second import could not be described at all.** The same function
assigns the caller's `*blob_mem` only on the path that queries `RESOURCE_INFO`,
so on a cache hit the caller's value stayed 0 from its `CALLOC`. The caller uses
exactly that value to decide whether to describe the resource to the host, so
every import sharing a buffer object with an earlier one silently declined to
describe itself. Measured directly: chroma arrived with `blob_mem=0` where luma
had `blob_mem=2`.

**3. A wider description never left the guest.** With the first two fixed, the
driver could describe the buffer as the planar whole. The winsys then dropped
it, because it only forwards a description while the resource is still untyped.
That is right for a retype and wrong for a plane. A description covering more
planes than any before it is not a correction of the earlier one, it names part
of the same buffer that nothing has described yet. Fixed by tracking the widest
plane count already described and letting a wider one through.

**4. The host built no image for the extra plane, then built it wrong.**
virglrenderer already had per-plane images and already selected them by index in
`vrend_create_sampler_view()`. Both halves of the mechanism existed and nothing
connected them. Upstream only builds those images from a `gbm_bo`, and crosvm
initialises virglrenderer with surfaceless EGL and no GBM device, so `egl->gbm`
is NULL and `virgl_egl_aux_plane_image_from_gbm_bo()` cannot serve here at all.

That last one had two more problems stacked behind it.

The fourcc has to be one the driver accepts. A two-channel 8-bit plane has two
DRM spellings that differ only in which byte is named first. Querying this
host's EGL:

```text
R8=1  GR88=0  RG88=1  NV12=1
```

It advertises `RG88` and refuses `GR88`, so importing chroma as `GR88`, the
semantically correct spelling, failed outright. Firefox carries the same
substitution for the same reason, which was reassuring to find. The fix is to
try both spellings rather than assuming either.

And the plane view has to be resolved first. The guest encodes the plane index
in the field that otherwise reads as `first_layer`, so a plane view arrives
looking like a request for layer N of a single-layer texture. The texture-view
branch validated that as a layer range and rejected it:

```text
vrend_create_sampler_view: Invalid number of layers (N) or zero levels requested
```

which poisoned the context before the plane could be resolved. Testing for an
auxiliary plane image before the texture-view branch fixes it.

The relevant commits are
[`virgl: describe further planes of a shared buffer on import`](https://github.com/vicondoa/mesa-venus-vulkan-video/commit/8a17985b9),
[`virgl: let a wider plane description reach the host`](https://github.com/vicondoa/mesa-venus-vulkan-video/commit/1b435c0e2),
[`vrend: build a per-plane image for further planes of a shared buffer`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/288f2070b),
[`vrend: import a chroma plane with a fourcc the host accepts`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/8483bf43d),
and
[`vrend: resolve a plane view before the texture-view branch`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/9990d225f).

Each defect alone is enough to produce a wrong picture, which is why every
partial fix relocated the symptom instead of removing it.

## Things that looked like fixes and were not

Each of these cost real time and would otherwise get retried.

Propagating `blob_mem` alone is necessary and not sufficient. Without defect 3
the wider description is dropped in the winsys, and without defect 4 the host
has nothing to build from.

Adding format-table entries alone fixed nothing. `PIPE_FORMAT_RG88_UNORM` was
genuinely missing from virgl's table and `GBM_FORMAT_GR88` was genuinely missing
from virglrenderer's, and both are real gaps that are kept, but nothing reached
them while the plane was never described.

Direct export does not work, and not for a reason in my code. Firefox only ever
requests the modifier-tiled export shape, and that exact query, NV12 with
`VIDEO_DECODE_DST` and a `DMA_BUF` handle type, is refused by the host NVIDIA
driver itself. I measured the same probe on both stacks to be sure. NV12 offers
one modifier there, `LINEAR`, without `VIDEO_DECODE_OUTPUT`.

Turning zero copy off to dodge the failing blit just moves
`GL_INVALID_OPERATION` from the decoder context to the renderer context. Both
consumers fail on the same badly described surface.

Teaching the blit to find the later plane is the first idea anybody has, and it
does not work. With zero copy off, the guest never imports the chroma plane as a
separate resource at all. Traced with `VIRGL_TRACE_IMPORT`, that run produced
6482 `plane=0` imports and zero `plane=1` imports. There is no plane for the
blit to find. Fixing the copy path means changing what gets imported, not what
the blit looks up. That one is still open.

## Where it landed

On a clean boot, with unmodified Firefox:

```text
plane image failures : 0
layer-validation err : 0
BLIT failures        : 0
CmdSubmit3d refusals : 0
Illegal cmd buffer   : 0
renderer decode      : decode_cmds=2048 sessions=1
frames               : 810 total, 6 dropped
host NVDEC engine    : nonzero in 35 of 35 samples
picture              : 12,619 distinct colours, mean RGB 152,158,158
```

YouTube works too, including its adaptive bitrate ladder. Playback switched from
854x480 to 1280x720 mid-stream and the decode path followed without a new
failure, rebuilding the decoder for the new resolution.

Firefox's fallback to software is completely silent, so "the video played"
proves nothing at all. Every claim here has a negative control: a rerun with the
feature disabled where decode commands and GPU decode-engine activity drop to
zero. `decode_cmds` is the number that carries the claim, because the negative
control established that it reads 0 when the Vulkan decoder is off. A nonzero
value means Vulkan Video decoded, not VA-API.

Reading the NVDEC percentage needs the same care. About 3% is what 720p30 costs
in real time on a T1000, not a throughput figure. The contrast is what carries
it: a software-decoding Firefox reads a flat 0 on every sample, and the same
clip decoded by guest ffmpeg as fast as it can reads 98% against 99%
host-native. Real-time playback sits where it should between those.

## What I would tell myself at the start

Two habits did nearly all the work, and I learned both the hard way here.

Measure both ends and compare. Firefox's log said `GR88 640x360` and the host
trace said `R8 1280x720`. Neither was suspicious alone. Together they named the
layer at fault immediately. Part of that evidence had been sitting uncollected
in the guest's log file for most of the investigation.

A control is worth more than a positive result. Running the same probe binary
against the host stack is what proved `GR88` was refused there rather than in my
code. Running the same decode host-native is what proved an early guest NVDEC
reading of 0% was a sampling artefact and not a fundamental blocker. And running
the same clip on both stacks is what proved the VA-API path was not decoding at
all, months after I had convinced myself it was.

Four successive causal claims I made in this project were wrong. Every one of
them came from reading source and reasoning forward instead of instrumenting and
reading back. The fix arrived within an hour of the first trace that logged both
sides of the same operation.

The Firefox fork can be deleted. That was the point.
