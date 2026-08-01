---
title: 'Getting Firefox to decode video on my old NVIDIA GPU in a microVM'
description:
  'Chronicle of my trials getting video decoding on my NVIDIA GPU working inside
  a Cloud Hypervisor microVM. Vulkan to the rescue, kind of.'
publishedAt: 2026-07-31
topics:
  - Virtualization
  - Graphics
  - Programming
---

I got stock upstream Firefox to decode H.264 in hardware from inside a
[Cloud Hypervisor](https://www.cloudhypervisor.org/) microVM on my desktop. It
renders through the host's NVIDIA T1000 and decodes on that card's NVDEC engine,
the fixed-function video decoder sitting on the NVIDIA die next to the shader
cores. None of this worked out of the box. Nothing in the stack carried video at
all, so I had to patch [Mesa](https://gitlab.freedesktop.org/mesa/mesa) in the
guest and [virglrenderer](https://gitlab.freedesktop.org/virgl/virglrenderer) on
the host, and extend the protocol between them. What I did not patch is Firefox.
Every change that makes it work lives underneath the browser.

That constraint drove everything. I already had a working decode path and it
required a forked Firefox, which means rebasing on a browser whose release
cadence is driven by security fixes. Every rebase is a chance to silently break
one. So I set the target at hardware decode with a completely unmodified
browser.

The guest never talks to the NVIDIA driver. It talks to `virtio-gpu`, a
paravirtualised GPU device, and the commands it writes there come out in a host
process that replays them against the real driver. That host process is
virglrenderer. The dialect is
[Venus](https://gitlab.freedesktop.org/virgl/venus-protocol), which serializes
Vulkan calls almost one for one rather than translating them, so a guest Vulkan
call becomes the same host Vulkan call. Venus ships as a Mesa ICD, an
Installable Client Driver, which is the shared library the Vulkan loader
presents to an application as a GPU driver.

## The virtual machine monitor, and why it is not crosvm

Cloud Hypervisor has no `virtio-gpu` device.
[Spectrum OS](https://spectrum-os.org/software/cloud-hypervisor/) maintains a
patch set that adds one, but their patches target Cloud Hypervisor v50 and I
wanted v52, which is the first release to ship `--generic-vhost-user` and which
includes the fix for CVE-2026-45782, a virtio-block use-after-free that is a
guest to host escape. So I
[vendored the Spectrum patches and rebased them onto v52](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video/pkgs/spectrum-ch/default.nix),
along with the [`rust-vmm/vhost`](https://github.com/rust-vmm/vhost) backports
the shared memory regions need. The two that matter are
[`virtio-devices: add a GPU device`](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video/pkgs/spectrum-ch/cloud-hypervisor/0002-virtio-devices-add-a-GPU-device.patch)
and
[`vhost-user-media device`](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video/pkgs/spectrum-ch/cloud-hypervisor/0003-vhost-user-media-device.patch).

The obvious question is why not run [crosvm](https://crosvm.dev/) as the VMM,
since it already has all of this. The answer is that the wider project this lab
belongs to has requirements crosvm does not serve. The one that decided it was a
software Trusted Platform Module. Cloud Hypervisor takes
[`--tpm socket=<path>`](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/nixos-modules/components/tpm.nix#L13-L27)
and speaks to an ordinary [swtpm](https://github.com/stefanberger/swtpm) on the
other end. crosvm's TPM backend is `vtpm_proxy`, compiled behind a `vtpm`
feature, and it forwards commands over D-Bus to `org.chromium.Vtpm`, a ChromeOS
service. There is no way to point it at an arbitrary swtpm socket. TPM state
persistence matters because wiping it looks like device tampering to remote
identity providers and forces re-enrolment.

crosvm still runs, as a sidecar holding the GPU. Cloud Hypervisor runs the VM,
crosvm runs `device gpu`, and the two speak vhost-user over a socket. vhost-user
is the convention for moving a virtio device's data path out of the VMM into a
separate process, which maps guest memory directly and is handed the queues over
a Unix socket. crosvm reaches the host driver through `rutabaga_gfx`, its
graphics abstraction layer, and then virglrenderer.

The
[launcher](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video/host/run-lab-vm.sh#L347-L381)
wires it up:

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

`--gpu-device-node` is not upstream. It is a
[small patch I carry](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video/pkgs/patches/crosvm-gpu-device-node.patch)
that lets the GPU sidecar be handed a DRM render node, which virglrenderer's
video code needs later. DRM is the Direct Rendering Manager, the kernel graphics
subsystem, and a render node is the `/dev/dri/renderD*` device granting
offscreen GPU access without the display-control privileges of the primary node.

That much gets page rendering onto the GPU. Video still decoded in software.

## What was missing

Firefox's Vulkan Video decoder hard-gates in
`SelectVulkanDecoderPhysicalDevice()` on two extensions being present,
`VK_KHR_video_queue` and `VK_KHR_video_decode_queue`. Venus advertised neither,
so Firefox fell through to VA-API, the Video Acceleration API, and then to
software. Below the browser, nothing existed at any layer:

| Layer                   | State before this work                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| venus-protocol          | zero video extensions in `VK_XML_EXTENSION_LIST`, no wire commands            |
| virglrenderer           | no `vkr_video.c`; `vkr_extension_table` strips video before the guest sees it |
| Mesa Venus              | no video passthrough, and actively strips video format-feature bits from NV12 |
| upstream merge requests | none, in any of the three                                                     |

The path I had to build, end to end:

```text
stock Firefox (guest)
  -> libavcodec.so.62  (ffmpeg 8, --enable-vulkan)
       -> AV_HWDEVICE_TYPE_VULKAN -> VK_KHR_video_decode_h264
            -> Mesa Venus ICD (guest)          <- add extension exposure
                 -> virtio-gpu / crosvm        <- unchanged, forwards bytes
                      -> virglrenderer (host)  <- add vkr_video.c
                           -> NVIDIA Vulkan ICD -> T1000 NVDEC4
```

crosvm and rutabaga need no changes. They forward bytes without inspecting them,
which is what you want in the middle of a protocol you are extending.

## Why Vulkan Video and not VA-API

VA-API is what Firefox looks for first on Linux, and `nvidia-vaapi-driver`
provides it on NVIDIA by translating to NVDEC. virglrenderer already has VA-API
video support and is even built with it. It cannot work, for a reason in the
wire format rather than in anyone's code.

Reaching it at all takes two overrides. Nothing passes
`VIRGL_RENDERER_USE_VIDEO`, bit 11 of the flags word `virgl_renderer_init()`
takes: `rutabaga_gfx` generates the constant into its bindings and references it
nowhere, its `VirglRendererFlags` builder stops at bit 10, and the inner `u32`
is private, so crosvm cannot set the bit even deliberately. The failure is
silent, because `virgl_video_init()` is what assigns `va_dpy` and
`virgl_video_fill_caps()` returns `-1` on a NULL one, so the capability set
reaches the guest with `num_video_caps = 0` and no error anywhere. Past that,
`virgl_video_init()` rejects any VA driver whose vendor string lacks
`Mesa Gallium`, which I overrode with a
[patch](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/pkgs/patches/virglrenderer-allow-nvidia-vaapi.patch)
on the reading that it looked conservative.

That reading was wrong. With both overrides the guest advertises three H.264
profiles and decodes nothing:

```text
VIRGL-VIDEO-EVIDENCE decode_bitstream=2048 failed=0 last_err=0
ERROR  end picture failed, err = 0x17          # VA_STATUS_ERROR_DECODING_ERROR
nvEndPicture cuvidDecodePicture failed: 1      # CUDA_ERROR_INVALID_VALUE
```

Every `vaCreateBuffer` and `vaRenderPicture` succeeds and `vaEndPicture`, the
call that commits the decode, is rejected for every frame. virglrenderer's
`h264_fill_slice_param()` sets two fields and leaves the rest commented out,
which looks like laziness and is not. The data is not on the wire. The
protocol's `virgl_h264_picture_desc` carries exactly one slice-related field:

```c
uint32_t slice_count;
```

A slice is an independently decodable chunk of one H.264 picture, and a decoder
needs its size, offset, type, and first macroblock to find it in the bitstream.
The virgl video protocol was designed against Mesa's VA drivers, which hand the
whole bitstream to hardware that parses slice headers itself. NVDEC does not
re-parse. `nvidia-vaapi-driver` builds `CUVIDPICPARAMS` from the VA slice
parameters, gets zeros where offsets and sizes belong, and `cuvidDecodePicture`
correctly rejects it. Upstream's "only supports mesa va drivers now" is an
accurate statement about what the protocol can express. Lifting it means
extending the virgl video wire format to carry per-slice parameters across guest
Mesa and virglrenderer for every codec, which is a protocol change rather than a
patch.

Vulkan Video has no such gap, and Firefox compiles it in unconditionally:

```python
# toolkit/moz.configure
set_config("MOZ_ENABLE_VULKAN_VIDEO", True, when=toolkit_gtk)
```

The V4L2 decoder I had been using before, V4L2 being the Video4Linux2 kernel
media interface, is gated to `target.cpu in ("arm", "aarch64", "riscv64")` on
the same file. One of those needs a browser fork and one does not.

## The three forks

I give each fork a `base/<rev>` tag at its seed commit and do the work on a
`vulkan-video` branch, so it stays rebaseable and upstreamable. Every link below
is pinned to a commit rather than a branch. I left long comments in the code
explaining why each change is shaped the way it is, and those comments are the
real reference.

| Upstream               | Fork, pinned                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virgl/venus-protocol` | [vicondoa/venus-protocol-vulkan-video @ `f81cb96`](https://github.com/vicondoa/venus-protocol-vulkan-video/tree/f81cb9634ffac0527bc6cef1dc483e0e2a666438)           |
| `virgl/virglrenderer`  | [vicondoa/virglrenderer-venus-vulkan-video @ `add87c0`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/tree/add87c05362359bf4d82067f2e9e37cd8705dc63) |
| `mesa/mesa`            | [vicondoa/mesa-venus-vulkan-video @ `848ed88`](https://github.com/vicondoa/mesa-venus-vulkan-video/tree/848ed88cbbfa14438185a504f2a09c4eb66d5bb2)                   |

**The wire protocol.** Venus command IDs are explicitly assigned in
`VK_EXT_command_serialization.xml` rather than derived from position, and the
wire format version must not change, because Venus requires exact guest and
renderer equality. At the base revision 345 command types were assigned; the
thirteen video commands append at 346 through 358 and no existing value moves.
The commits are
[protocol list](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/956d64c4c3dbe23ab3f8142048252f9b33cd3621),
[StdVideo definitions and flag packing](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/60f3e3e7d920ff035bb33ea4372196d76a3bda25),
[codec struct serialization](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/6d8934d0517a8162669795cd67de5a073d1c8188),
and
[capping guest-controlled array counts](https://github.com/vicondoa/venus-protocol-vulkan-video/commit/205da3fe3faa7f153097f8cf405e2012c9e22ea6).
StdVideo is Vulkan's name for the structs carrying codec-defined syntax elements
rather than Vulkan ones, so a `StdVideoH264SequenceParameterSet` is the H.264
spec's sequence parameter set with its field names intact. Those are full of
packed bitfields whose layout the C compiler chooses, which is why they cannot
be memcpy'd across a wire that two toolchains might compile. The last commit
matters more than it looks: every array count in a video struct arrives from an
untrusted guest, and capping them is the difference between a protocol extension
and a way out of the VM.

**The guest driver.** I gave Mesa's Venus ICD nine video entrypoints in
[`src/virtio/vulkan/vn_video.c`](https://github.com/vicondoa/mesa-venus-vulkan-video/blob/848ed88cbbfa14438185a504f2a09c4eb66d5bb2/src/virtio/vulkan/vn_video.c),
covering session creation, session parameters, and memory binding, plus four
command-buffer entrypoints in `vn_command_buffer.c`:
`vn_CmdBeginVideoCodingKHR()`, `vn_CmdEndVideoCodingKHR()`,
`vn_CmdControlVideoCodingKHR()`, and `vn_CmdDecodeVideoKHR()`. Exposure is
conditional on the renderer, so the extension bits are set only alongside a
`renderer_extensions.KHR_video_queue` check, and
`VkQueueFamilyVideoPropertiesKHR` is chained into the queue family query so a
guest sees per-family codec operations rather than a video queue that decodes
nothing. Decode only, H.264 only, no encode.

**The host renderer.** I gave virglrenderer
[`src/venus/vkr_video.c`](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/blob/add87c05362359bf4d82067f2e9e37cd8705dc63/src/venus/vkr_video.c),
about 540 lines, plus `vkr_video_validate.h`, `vkr_video_reject.h`, and
`vkr_video_scrub.h`. Those validate the decode scope, the DPB slots, the
capabilities, and the command sequence on the way in, and scrub reply payloads
on the way out. The DPB is the Decoded Picture Buffer, the set of
already-decoded frames the codec may reference when decoding the next one, and a
guest that can name slots outside it can make the host read memory it should
not.
[Scrubbing the video format query reply flags](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/a5e86c4cd7fd946f4a9d96db1bb718f88c683054)
and
[zeroing output pNext payloads on the format-query reject](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/c44f6e50a6b002c65f566367e9961e0c02ad6173)
both exist to avoid leaking host state back to the guest on a failed path.

With those three in place `vkCmdDecodeVideoKHR` fired, the sessions came up, and
I saw activity on the host NVDEC engine.

## The green frame

Firefox then played about half a second of video and showed a flat dark green
rectangle. Decode was fine throughout. Presentation was broken, and the two are
different stacks: decode is Vulkan through Venus, presentation is OpenGL through
virgl, where the decoded frame is exported as a DMA-BUF and re-imported as GL
textures for the compositor. A DMA-BUF is a kernel object that lets one driver
hand a buffer to another as a file descriptor without a copy.

A decoded NV12 frame is one multi-planar `VkImage` backed by one
`VkDeviceMemory`, because `vkCmdDecodeVideoKHR` takes a single
`dstPictureResource`. NV12 stores brightness and colour in separate planes:

```text
offset 0        luma    1280x720, one byte per texel,  stride 1280
offset 983040   chroma   640x360, two bytes per texel, stride 1280
```

983040 is 1280x768, so luma is padded to a 768-row alignment and chroma begins
beyond the end of luma's own 921600-byte extent. That shape is not negotiable.
Two separate images breaks decode, and disjoint planes via
`VK_IMAGE_CREATE_DISJOINT_BIT` would work but appear nowhere in ffmpeg's
`hwcontext_vulkan.c`, and changing the client is the thing I am refusing to do.

Firefox imports the two planes separately, one EGL image each, EGL being the
interface a driver uses to import buffers. That is the portable approach that
works on every native driver. Its log reports both imports succeeding with every
field correct. The two file descriptors refer to regions of one buffer, so in
the guest they resolve to the same GEM handle, the kernel's process-local
integer naming one buffer object. Four defects sat between that log and a
correct picture.

**1. The plane index did not survive the import.**
[`virgl_drm_winsys_resource_create_handle()`](https://github.com/vicondoa/mesa-venus-vulkan-video/blob/848ed88cbbfa14438185a504f2a09c4eb66d5bb2/src/gallium/winsys/virgl/drm/virgl_drm_winsys.c#L635-L663)
caches imported buffer objects by GEM handle, so both planes hit the same cache
entry and nothing recorded which plane each import was. Every plane presented as
plane 0 of a fresh buffer. That index is load bearing, because `virgl_encode.c`
writes `res->metadata.plane` into the field virglrenderer reads to select a
per-plane image. Fixed by recording import offsets per buffer object in
first-seen order, where the index of an offset is the plane index.

**2. The second import could not be described at all.** The same function
[assigns the caller's `*blob_mem` only on the path that queries `RESOURCE_INFO`](https://github.com/vicondoa/mesa-venus-vulkan-video/blob/848ed88cbbfa14438185a504f2a09c4eb66d5bb2/src/gallium/winsys/virgl/drm/virgl_drm_winsys.c#L569-L584),
so on a cache hit the caller's value stayed 0 from its `CALLOC`. `blob_mem`
records which memory scheme a virtio-gpu blob resource uses, and the caller uses
exactly that value to decide whether to describe the resource to the host. Every
import sharing a buffer object with an earlier one silently declined to describe
itself. Measured directly: chroma arrived with `blob_mem=0` where luma had
`blob_mem=2`.

**3. A wider description never left the guest.** With those fixed,
[the driver could describe the buffer as the planar whole](https://github.com/vicondoa/mesa-venus-vulkan-video/blob/848ed88cbbfa14438185a504f2a09c4eb66d5bb2/src/gallium/drivers/virgl/virgl_resource.c#L945-L996),
and the winsys dropped it, because
[it only forwards a description while the resource is still untyped](https://github.com/vicondoa/mesa-venus-vulkan-video/blob/848ed88cbbfa14438185a504f2a09c4eb66d5bb2/src/gallium/winsys/virgl/drm/virgl_drm_winsys.c#L686-L698).
That is right for a retype and wrong for a plane. A description covering more
planes than any before it names part of the same buffer that nothing has
described yet. Fixed by tracking the widest plane count already described and
letting a wider one through.

**4. The host built no image for the extra plane, then built it wrong.**
virglrenderer already had per-plane images and already selected them by index in
`vrend_create_sampler_view()`, and nothing connected the two halves. Upstream
only builds those images from a `gbm_bo`, and crosvm initialises virglrenderer
with surfaceless EGL and no GBM (Generic Buffer Management) device, so
`egl->gbm` is NULL and `virgl_egl_aux_plane_image_from_gbm_bo()` cannot serve
here at all. The replacement
[imports the plane straight from the DMA-BUF](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/blob/add87c05362359bf4d82067f2e9e37cd8705dc63/src/vrend/vrend_renderer.c#L13604-L13633)
with the per-plane stride and offset the guest sent.

That last one had two problems stacked behind it. The fourcc, the four-character
code naming a pixel format, has to be one the driver accepts, and a two-channel
8-bit plane has two DRM spellings differing only in which byte is named first.
Querying this host's EGL returned `RG88=1` and `GR88=0`, so importing chroma as
`GR88`, the semantically correct spelling, failed outright. Firefox carries the
same substitution for the same reason. The fix is to
[try both spellings](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/blob/add87c05362359bf4d82067f2e9e37cd8705dc63/src/vrend/vrend_renderer.c#L13645-L13660).
Then the plane view has to be resolved first: the guest encodes the plane index
in the field that otherwise reads as `first_layer`, so a plane view arrives
looking like a request for layer N of a single-layer texture, and the
texture-view branch validated it as a layer range and rejected it, poisoning the
context.
[Testing for an auxiliary plane image before the texture-view branch](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/blob/add87c05362359bf4d82067f2e9e37cd8705dc63/src/vrend/vrend_renderer.c#L2797-L2818)
fixes it, and is safe because an auxiliary image exists at an index only for a
resource whose planes were imported separately.

The commits are
[describe further planes of a shared buffer on import](https://github.com/vicondoa/mesa-venus-vulkan-video/commit/8a17985b915e9f6b7f245ae92997eafac944f30d),
[let a wider plane description reach the host](https://github.com/vicondoa/mesa-venus-vulkan-video/commit/1b435c0e27e68cbf45d54033cd2aa109a9f00cb8),
[build a per-plane image for further planes](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/288f2070bb7de4234fbcc81405d543d1d83ea46d),
[import a chroma plane with a fourcc the host accepts](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/8483bf43df59e5fab67ecf648420fb5a2425c1ae),
and
[resolve a plane view before the texture-view branch](https://github.com/vicondoa/virglrenderer-venus-vulkan-video/commit/9990d225fbb6e4238cfe8a30ffdd270b44c8465a).
Each defect alone produces a wrong picture, which is why every partial fix
relocated the symptom instead of removing it.

## The presentation path depends on the VA-API dead end

Firefox has three routes from a decoded frame to the screen. Direct export hands
the Vulkan image out as a DMA-BUF. GPU copy blits the imported surface plane by
plane into textures Firefox owns. Zero copy hands the imported surface to the
compositor and lets it sample from the decoder's own memory.

The defect 4 fix lands in `vrend_create_sampler_view()`, and only the zero-copy
route goes through a sampler view. The copy route blits from the resource's own
texture, never reaches the per-plane image, and stays broken regardless. So the
working configuration has to select zero copy.

Firefox configures `HW_DECODED_VIDEO_ZERO_COPY` only after
`gfxPlatformGtk::InitPlatformHardwareVideoConfig()` gets past an early return
requiring the generic `HARDWARE_VIDEO_DECODING` feature, and that feature is
decided by a VA-API probe. With zero copy unconfigured,
`VideoFramePool::ShouldCopySurface()` returns true unconditionally and every
frame takes the broken copy path. The VA-API work that failed at decoding is
what opens the presentation path: the guest advertising three H.264 profiles is
what the probe reads. `InitHWDecoderIfAllowed()` then tries
`InitVulkanDecoder()` before `InitVAAPIDecoder()`, so Vulkan Video still decodes
every frame.

I want to be honest about how good that is. Before this, the lab set
`gfx.blacklist.hardwarevideodecoding` to `1` to skip the probe outright, which
was a lie told to the browser. That pref is gone and Firefox reaches its own
conclusion from what the driver reports. But the guest's VA-API decode is
hollow, so the position moved from asserting a capability the guest does not
have to relying on one the guest advertises but has not been shown to possess.
The residual risk is narrow and real: if Firefox ever ordered VA-API ahead of
Vulkan, it would be selecting on an advertisement I have measured against. It
does not do that today.

## Four other things that had to be true

`VN_DEBUG=no_nvidia_drm_spoof` is required. Venus zeroes out
`VkPhysicalDeviceDrmPropertiesEXT` on NVIDIA hosts as a window system
integration workaround, and Firefox reads that same property for an unrelated
decision. Removing the flag returns 1820 `CmdSubmit3d` refusals.

ffmpeg 8 has to be explicitly on `LD_LIBRARY_PATH`. ffmpeg 7's
`vulkan_map_to_drm()` waits on a number of semaphores equal to the plane count
while the `f->sem[]` array it reads them from is sized by image count, so an
NV12 frame's `sem[1]` is `VK_NULL_HANDLE` and the wait faults. Firefox already
prefers `libavcodec.so.62` when it can find it, and the nixpkgs wrapper
hardcodes `ffmpeg_7`, so `.62` was never on the path.

Venus's `vn_GetMemoryFdKHR()` needs a null guard. Exporting memory allocated
without an export handle type dereferenced NULL in the guest ICD, which a debug
assert catches and a release build turns into a dead process.

Two format-table entries were missing. `DRM_FORMAT_GR88` maps to
`PIPE_FORMAT_RG88_UNORM`, absent from virgl's table and so resolving to
`VIRGL_FORMAT_NONE`, and virglrenderer's GBM conversion table had no entry for a
two-channel 8-bit plane. Both are genuine gaps and both are kept, though neither
fixed anything on its own.

## What did not work

V4L2 was my previous approach and it still works, through a patched crosvm
`virtio-media` device forwarded by a patched Cloud Hypervisor to a VA-API
backend. It has two problems. Decode is a completely separate path from
rendering, so decoded frames are not first-class GPU images on the same device
as everything else. More importantly Firefox does not use it without a fork,
because `MOZ_ENABLE_V4L2` is gated to arm, aarch64, and riscv64. My
[firefox-v4l2-nvidia](https://github.com/vicondoa/firefox-v4l2-nvidia) fork
carries four patches, three of which exist only to defeat gates upstream put
there deliberately. That fork can now be deleted, which was the point.

Direct export does not work, for a reason outside my code. Firefox only ever
requests the modifier-tiled export shape, and that exact query, NV12 with
`VIDEO_DECODE_DST` and a `DMA_BUF` handle type, is refused by the host NVIDIA
driver. NV12 offers exactly one modifier there, `LINEAR`, and it comes without
`VIDEO_DECODE_OUTPUT`.

Teaching the blit to find the later plane is the first idea anybody has, since
the copy path is only broken because it cannot reach the per-plane image. It
does not work, and the reason is the interesting part: with zero copy off, the
guest never imports the chroma plane as a separate resource at all. That run
produced 6482 `plane=0` imports and zero `plane=1` imports, so plane-index
inference correctly returns `-1` and the blit fails for the original reason.
Fixing the copy path means changing what gets imported rather than what the blit
looks up. That is the one loose end I would most like to close, because it would
remove the dependency on zero copy and therefore on the VA-API probe.

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

YouTube works, including its adaptive bitrate ladder: playback switched from
854x480 to 1280x720 mid-stream and the decode path rebuilt the decoder for the
new resolution without a new failure. That result comes with a permanent pin
attached. WebM is disabled by policy in the guest, so YouTube serves H.264 in
MP4, which is the only codec Venus carries today. The driver here does ship
`VK_KHR_video_decode_vp9`, so VP9 is deferred rather than blocked, but Turing,
the generation this T1000 belongs to, has no AV1 decode engine at all.

Firefox's fallback to software is completely silent, so "the video played"
proves nothing. `decode_cmds` is the number that carries the claim, because a
negative control with the Vulkan decoder disabled establishes that it reads 0.
Reading the NVDEC percentage needs the same care: about 3% is what 720p30 costs
in real time on a T1000, and the contrast is what carries it, since a
software-decoding Firefox reads a flat 0 on every sample while the same clip
decoded as fast as possible reads 98% against 99% host-native.

I am not publishing a frame-drop figure, because I do not have an honest one.
The numbers I have were taken with seven other VMs and several `rustc` jobs
saturating the host. Whether 720p is clean on a quiet machine is unmeasured.

## This is a prototype

Everything above runs in an isolated lab, not in anything I depend on. It is a
single NixOS flake that builds the three forks, the patched crosvm and Cloud
Hypervisor, and a guest image with stock Firefox in it, and it launches one VM
on demand. The lab is
[`labs/venus-vulkan-video`](https://github.com/vicondoa/d2b/tree/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video)
in my [d2b](https://github.com/vicondoa/d2b) repository, and
[`SOLUTION.md`](https://github.com/vicondoa/d2b/blob/ed38e5e5b1fbb6268cf72265a17cbf6fca1d5f84/labs/venus-vulkan-video/SOLUTION.md)
there is the full account, including the findings documents for the paths that
failed.

None of it is upstream, none of it has been reviewed by anyone who maintains
these projects, and the security-relevant parts, meaning the validation and
scrubbing around a wire format a guest controls, have had exactly one set of
eyes on them. The forks are structured to be rebaseable and upstreamable because
that is where this should go, and it has not gone there yet.
