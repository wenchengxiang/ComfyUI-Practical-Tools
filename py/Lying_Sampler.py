import numpy as np
import torch

from comfy.samplers import KSAMPLER


def make_detail_daemon_schedule(
    steps,
    start,
    end,
    bias,
    amount,
    exponent,
    start_offset,
    end_offset,
    fade,
    smooth,
):
    start = min(start, end)
    mid = start + bias * (end - start)
    multipliers = np.zeros(steps)

    start_idx, mid_idx, end_idx = [
        int(round(x * (steps - 1)))
        for x in [start, mid, end]
    ]

    start_values = np.linspace(
        0,
        1,
        mid_idx - start_idx + 1,
    )

    if smooth:
        start_values = 0.5 * (
            1 - np.cos(start_values * np.pi)
        )

    start_values = start_values ** exponent

    if start_values.any():
        start_values *= amount - start_offset
        start_values += start_offset

    end_values = np.linspace(
        1,
        0,
        end_idx - mid_idx + 1,
    )

    if smooth:
        end_values = 0.5 * (
            1 - np.cos(end_values * np.pi)
        )

    end_values = end_values ** exponent

    if end_values.any():
        end_values *= amount - end_offset
        end_values += end_offset

    multipliers[
        start_idx:mid_idx + 1
    ] = start_values

    multipliers[
        mid_idx:end_idx + 1
    ] = end_values

    multipliers[:start_idx] = start_offset
    multipliers[end_idx + 1:] = end_offset

    multipliers *= 1 - fade

    return multipliers


def get_dd_schedule(
    sigma: float,
    sigmas: torch.Tensor,
    dd_schedule: torch.Tensor,
) -> float:

    sched_len = len(dd_schedule)

    if (
        sched_len < 2
        or len(sigmas) < 2
        or sigma <= 0
        or not (
            sigmas[-1]
            <= sigma
            <= sigmas[0]
        )
    ):
        return 0.0

    deltas = (
        sigmas[:-1] - sigma
    ).abs()

    idx = int(
        deltas.argmin()
    )

    if (
        (
            idx == 0
            and sigma >= sigmas[0]
        )
        or (
            idx == sched_len - 1
            and sigma <= sigmas[-2]
        )
        or deltas[idx] == 0
    ):
        return dd_schedule[
            idx
        ].item()

    idxlow, idxhigh = (
        (idx, idx - 1)
        if sigma > sigmas[idx]
        else (idx + 1, idx)
    )

    nlow = sigmas[idxlow]
    nhigh = sigmas[idxhigh]

    if nhigh - nlow == 0:
        return dd_schedule[
            idxlow
        ]

    ratio = (
        (sigma - nlow)
        / (nhigh - nlow)
    ).clamp(0, 1)

    return torch.lerp(
        dd_schedule[idxlow],
        dd_schedule[idxhigh],
        ratio,
    ).item()


def detail_daemon_sampler(
    model: object,
    x: torch.Tensor,
    sigmas: torch.Tensor,
    *,
    dds_wrapped_sampler: object,
    dds_make_schedule: callable,
    dds_cfg_scale_override: float,
    **kwargs: dict,
) -> torch.Tensor:

    if dds_cfg_scale_override > 0:
        cfg_scale = (
            dds_cfg_scale_override
        )
    else:
        maybe_cfg_scale = getattr(
            model.inner_model,
            "cfg",
            None,
        )

        cfg_scale = (
            float(maybe_cfg_scale)
            if isinstance(
                maybe_cfg_scale,
                (int, float),
            )
            else 1.0
        )

    dd_schedule = torch.tensor(
        dds_make_schedule(
            len(sigmas) - 1
        ),
        dtype=torch.float32,
        device="cpu",
    )

    sigmas_cpu = (
        sigmas.detach()
        .clone()
        .cpu()
    )

    sigma_max = float(
        sigmas_cpu[0]
    )

    sigma_min = (
        float(sigmas_cpu[-1])
        + 1e-05
    )

    def model_wrapper(
        x: torch.Tensor,
        sigma: torch.Tensor,
        **extra_args: dict,
    ):
        sigma_float = float(
            sigma.max()
            .detach()
            .cpu()
        )

        if not (
            sigma_min
            <= sigma_float
            <= sigma_max
        ):
            return model(
                x,
                sigma,
                **extra_args,
            )

        dd_adjustment = (
            get_dd_schedule(
                sigma_float,
                sigmas_cpu,
                dd_schedule,
            )
            * 0.1
        )

        adjusted_sigma = (
            sigma
            * max(
                1e-06,
                1.0
                - dd_adjustment
                * cfg_scale,
            )
        )

        return model(
            x,
            adjusted_sigma,
            **extra_args,
        )

    for k in (
        "inner_model",
        "sigmas",
    ):
        if hasattr(model, k):
            setattr(
                model_wrapper,
                k,
                getattr(model, k),
            )

    return (
        dds_wrapped_sampler
        .sampler_function(
            model_wrapper,
            x,
            sigmas,
            **kwargs,
            **dds_wrapped_sampler
            .extra_options,
        )
    )


class wcx_LyingSampler:

    DESCRIPTION = (
        "Detail Daemon sampler wrapper. "
        "Adjusts the sigma passed to the model "
        "while keeping the original sampling schedule."
    )

    CATEGORY = (
        "Practical-Tools/Sampling"
    )

    RETURN_TYPES = (
        "SAMPLER",
    )

    FUNCTION = "go"

    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {

                "sampler": (
                    "SAMPLER",
                ),

                "detail_amount": (
                    "FLOAT",
                    {
                        "default": 0.1,
                        "min": -5.0,
                        "max": 5.0,
                        "step": 0.01,
                    },
                ),

                "start": (
                    "FLOAT",
                    {
                        "default": 0.2,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                    },
                ),

                "end": (
                    "FLOAT",
                    {
                        "default": 0.8,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                    },
                ),

                "bias": (
                    "FLOAT",
                    {
                        "default": 0.5,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                    },
                ),

                "exponent": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.0,
                        "max": 10.0,
                        "step": 0.05,
                    },
                ),

                "start_offset": (
                    "FLOAT",
                    {
                        "default": 0.0,
                        "min": -1.0,
                        "max": 1.0,
                        "step": 0.01,
                    },
                ),

                "end_offset": (
                    "FLOAT",
                    {
                        "default": 0.0,
                        "min": -1.0,
                        "max": 1.0,
                        "step": 0.01,
                    },
                ),

                "fade": (
                    "FLOAT",
                    {
                        "default": 0.0,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.05,
                    },
                ),

                "smooth": (
                    "BOOLEAN",
                    {
                        "default": True,
                    },
                ),

                "cfg_scale_override": (
                    "FLOAT",
                    {
                        "default": 0,
                        "min": 0.0,
                        "max": 100.0,
                        "step": 0.5,
                        "round": 0.01,
                        "tooltip": (
                            "If set to 0, the sampler "
                            "will automatically determine "
                            "the CFG scale (if possible). "
                            "Set to some other value "
                            "to override."
                        ),
                    },
                ),
            },
        }

    @classmethod
    def go(
        cls,
        sampler: object,
        *,
        detail_amount,
        start,
        end,
        bias,
        exponent,
        start_offset,
        end_offset,
        fade,
        smooth,
        cfg_scale_override,
    ) -> tuple:

        def dds_make_schedule(
            steps,
        ):
            return make_detail_daemon_schedule(
                steps,
                start,
                end,
                bias,
                detail_amount,
                exponent,
                start_offset,
                end_offset,
                fade,
                smooth,
            )

        return (
            KSAMPLER(
                detail_daemon_sampler,
                extra_options={
                    "dds_wrapped_sampler": sampler,
                    "dds_make_schedule": (
                        dds_make_schedule
                    ),
                    "dds_cfg_scale_override": (
                        cfg_scale_override
                    ),
                },
            ),
        )


NODE_CLASS_MAPPINGS = {
    "wcx_LyingSampler": wcx_LyingSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_LyingSampler": "Lying Sampler",
}