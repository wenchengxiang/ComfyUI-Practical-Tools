import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function imageDataToUrl(data) {
    return api.apiURL(`/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}${app.getPreviewFormatParam()}${app.getRandParam()}`);
}

class WCXImageComparerWidget {
    constructor(name, node) {
        this.name = name;
        this.type = "custom";
        this.hitAreas = {};
        this.selected = [];
        this._value = { images: [] };
        this.node = node;
    }

    set value(v) {
        let cleanedVal;
        if (Array.isArray(v)) {
            cleanedVal = v.map((d, i) => {
                if (!d || typeof d === "string") {
                    d = { url: d, name: i === 0 ? "A" : "B", selected: true };
                }
                return d;
            });
        } else {
            cleanedVal = v.images || [];
        }

        if (cleanedVal.length > 2) {
            const hasAAndB = cleanedVal.some((i) => i.name.startsWith("A")) &&
                cleanedVal.some((i) => i.name.startsWith("B"));
            if (!hasAAndB) {
                cleanedVal = [cleanedVal[0], cleanedVal[1]];
            }
        }

        let selected = cleanedVal.filter((d) => d.selected);
        if (!selected.length && cleanedVal.length) {
            cleanedVal[0].selected = true;
        }
        selected = cleanedVal.filter((d) => d.selected);
        if (selected.length === 1 && cleanedVal.length > 1) {
            cleanedVal.find((d) => !d.selected).selected = true;
        }

        this._value.images = cleanedVal;
        selected = cleanedVal.filter((d) => d.selected);
        this.setSelected(selected);
    }

    get value() {
        return this._value;
    }

    setSelected(selected) {
        this._value.images.forEach((d) => (d.selected = false));
        if (!this.node.compareImgs) {
            this.node.compareImgs = [];
        }
        this.node.compareImgs.length = 0;
        
        // 关键点：删除 node.imgs，防止触发 ComfyUI 原生图片预览控件覆盖层
        if (this.node.imgs) {
            delete this.node.imgs;
        }

        for (const sel of selected) {
            if (!sel.img) {
                sel.img = new Image();
                sel.img.onload = () => {
                    this.node.setDirtyCanvas?.(true, true);
                };
                sel.img.src = sel.url;
                this.node.compareImgs.push(sel.img);
            }
            sel.selected = true;
        }
        this.selected = selected;
    }

    draw(ctx, node, width, y) {
        this.hitAreas = {};
        if (this.value.images.length > 2) {
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.font = `14px Arial`;
            const drawData = [];
            const spacing = 5;
            let x = 0;
            for (const img of this.value.images) {
                const textWidth = ctx.measureText(img.name).width;
                drawData.push({
                    img,
                    text: img.name,
                    x,
                    width: textWidth,
                });
                x += textWidth + spacing;
            }
            x = (node.size[0] - (x - spacing)) / 2;
            for (const d of drawData) {
                ctx.fillStyle = d.img.selected ? "rgba(180, 180, 180, 1)" : "rgba(180, 180, 180, 0.5)";
                ctx.fillText(d.text, x, y);
                this.hitAreas[d.text] = {
                    bounds: [x, y, d.width, 14],
                    data: d.img,
                    onDown: this.onSelectionDown,
                };
                x += d.width + spacing;
            }
            y += 20;
        }

        if (node.properties?.["comparer_mode"] === "Click") {
            this.drawImage(ctx, this.selected[this.node.isPointerDown ? 1 : 0], y);
        } else {
            this.drawImage(ctx, this.selected[0], y);
            if (node.isPointerOver) {
                this.drawImage(ctx, this.selected[1], y, this.node.pointerOverPos[0]);
            }
        }
    }

    onSelectionDown(event, pos, node, bounds) {
        const selected = [...this.selected];
        if (bounds?.data?.name?.startsWith("A")) {
            selected[0] = bounds.data;
        } else if (bounds?.data?.name?.startsWith("B")) {
            selected[1] = bounds.data;
        }
        this.setSelected(selected);
    }

    drawImage(ctx, image, y, cropX) {
        if (!image?.img?.naturalWidth || !image?.img?.naturalHeight) return;

        let [nodeWidth, nodeHeight] = this.node.size;
        const imageAspect = image.img.naturalWidth / image.img.naturalHeight;
        let height = nodeHeight - y;
        const widgetAspect = nodeWidth / height;
        let targetWidth, targetHeight;
        let offsetX = 0;

        if (imageAspect > widgetAspect) {
            targetWidth = nodeWidth;
            targetHeight = nodeWidth / imageAspect;
        } else {
            targetHeight = height;
            targetWidth = height * imageAspect;
            offsetX = (nodeWidth - targetWidth) / 2;
        }

        const widthMultiplier = image.img.naturalWidth / targetWidth;
        const sourceX = 0;
        const sourceY = 0;
        const sourceWidth = cropX != null ? (cropX - offsetX) * widthMultiplier : image.img.naturalWidth;
        const sourceHeight = image.img.naturalHeight;
        const destX = (nodeWidth - targetWidth) / 2;
        const destY = y + (height - targetHeight) / 2;
        const destWidth = cropX != null ? cropX - offsetX : targetWidth;
        const destHeight = targetHeight;

        ctx.save();
        ctx.beginPath();
        let globalCompositeOperation = ctx.globalCompositeOperation;
        if (cropX) {
            ctx.rect(destX, destY, destWidth, destHeight);
            ctx.clip();
        }
        ctx.drawImage(image.img, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

        if (cropX != null && cropX >= (nodeWidth - targetWidth) / 2 && cropX <= targetWidth + offsetX) {
            ctx.beginPath();
            ctx.moveTo(cropX, destY);
            ctx.lineTo(cropX, destY + destHeight);
            ctx.globalCompositeOperation = "difference";
            ctx.strokeStyle = "rgba(255,255,255, 1)";
            ctx.stroke();
        }
        ctx.globalCompositeOperation = globalCompositeOperation;
        ctx.restore();
    }

    computeSize(width) {
        return [width, 20];
    }

    serializeValue(node, index) {
        const v = [];
        for (const data of this._value.images) {
            const d = { ...data };
            delete d.img;
            v.push(d);
        }
        return { images: v };
    }
}

app.registerExtension({
    name: "wcx.ImageComparer",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "wcx_ImageComparer") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                this.imageIndex = 0;
                this.compareImgs = []; // 使用 compareImgs 替代 imgs
                delete this.imgs;
                this.serialize_widgets = true;
                this.isPointerDown = false;
                this.isPointerOver = false;
                this.pointerOverPos = [0, 0];
                this.properties = this.properties || {};
                this.properties["comparer_mode"] = "Slide";

                this["@comparer_mode"] = {
                    type: "combo",
                    values: ["Slide", "Click"],
                };

                this.canvasWidget = this.addCustomWidget(new WCXImageComparerWidget("wcx_comparer", this));
                this.setSize?.(this.computeSize?.() || [300, 300]);
                this.setDirtyCanvas?.(true, true);
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (output) {
                onExecuted?.apply(this, arguments);
                if (!this.canvasWidget || !output) return;

                if ("images" in output) {
                    this.canvasWidget.value = {
                        images: (output.images || []).map((d, i) => ({
                            name: i === 0 ? "A" : "B",
                            selected: true,
                            url: imageDataToUrl(d),
                        })),
                    };
                } else {
                    const a_images = output.a_images || [];
                    const b_images = output.b_images || [];
                    const imagesToChoose = [];
                    const multiple = a_images.length + b_images.length > 2;

                    for (const [i, d] of a_images.entries()) {
                        imagesToChoose.push({
                            name: a_images.length > 1 || multiple ? `A${i + 1}` : "A",
                            selected: i === 0,
                            url: imageDataToUrl(d),
                        });
                    }
                    for (const [i, d] of b_images.entries()) {
                        imagesToChoose.push({
                            name: b_images.length > 1 || multiple ? `B${i + 1}` : "B",
                            selected: i === 0,
                            url: imageDataToUrl(d),
                        });
                    }
                    this.canvasWidget.value = { images: imagesToChoose };
                }
            };

            nodeType.prototype.setIsPointerDown = function (down = this.isPointerDown) {
                const newIsDown = down && !!app.canvas.pointer_is_down;
                if (this.isPointerDown !== newIsDown) {
                    this.isPointerDown = newIsDown;
                    this.setDirtyCanvas(true, false);
                }
                this.imageIndex = this.isPointerDown ? 1 : 0;
                if (this.isPointerDown) {
                    requestAnimationFrame(() => this.setIsPointerDown());
                }
            };

            const onMouseDown = nodeType.prototype.onMouseDown;
            nodeType.prototype.onMouseDown = function (event, pos, canvas) {
                onMouseDown?.apply(this, arguments);
                this.setIsPointerDown(true);
                return false;
            };

            const onMouseEnter = nodeType.prototype.onMouseEnter;
            nodeType.prototype.onMouseEnter = function (event) {
                onMouseEnter?.apply(this, arguments);
                this.setIsPointerDown(!!app.canvas.pointer_is_down);
                this.isPointerOver = true;
            };

            const onMouseLeave = nodeType.prototype.onMouseLeave;
            nodeType.prototype.onMouseLeave = function (event) {
                onMouseLeave?.apply(this, arguments);
                this.setIsPointerDown(false);
                this.isPointerOver = false;
            };

            const onMouseMove = nodeType.prototype.onMouseMove;
            nodeType.prototype.onMouseMove = function (event, pos, canvas) {
                onMouseMove?.apply(this, arguments);
                this.pointerOverPos = [...pos];
                this.imageIndex = this.pointerOverPos[0] > this.size[0] / 2 ? 1 : 0;
            };
        }
    },
});