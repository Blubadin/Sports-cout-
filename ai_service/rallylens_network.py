"""Network topology for the audited local RallyLens checkpoint, not a model guess.

Reference: RallyLens src/rallylens/vision/tracknet.py (project declares MIT).
Local source SHA256: b2b153990578c193535d2519a922e6feb2ba31ada7ffcf94ab31596590229438.
Only the heatmap network is used; no InpaintNet or hit/shot recognition.
Weights are external and are not redistributed by SportsScout.
"""

import torch
from torch import nn


class ConvBlock(nn.Module):
    def __init__(self, inputs, outputs):
        super().__init__()
        self.conv = nn.Conv2d(inputs, outputs, 3, padding=1, bias=False)
        self.bn = nn.BatchNorm2d(outputs)
        self.relu = nn.ReLU()

    def forward(self, x):
        return self.relu(self.bn(self.conv(x)))


class ConvStack(nn.Module):
    def __init__(self, inputs, outputs, depth):
        super().__init__()
        for index in range(depth):
            self.add_module(f'conv_{index + 1}', ConvBlock(inputs if index == 0 else outputs, outputs))

    def forward(self, x):
        for block in self.children():
            x = block(x)
        return x


class RallyLensTrackNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.down_block_1 = ConvStack(27, 64, 2)
        self.down_block_2 = ConvStack(64, 128, 2)
        self.down_block_3 = ConvStack(128, 256, 3)
        self.bottleneck = ConvStack(256, 512, 3)
        self.up_block_1 = ConvStack(768, 256, 3)
        self.up_block_2 = ConvStack(384, 128, 2)
        self.up_block_3 = ConvStack(192, 64, 2)
        self.predictor = nn.Conv2d(64, 8, 1)
        self.sigmoid = nn.Sigmoid()
        self.pool = nn.MaxPool2d(2, 2)
        self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False)

    def forward(self, x):
        first = self.down_block_1(x)
        second = self.down_block_2(self.pool(first))
        third = self.down_block_3(self.pool(second))
        hidden = self.bottleneck(self.pool(third))
        hidden = self.up_block_1(torch.cat((self.up(hidden), third), dim=1))
        hidden = self.up_block_2(torch.cat((self.up(hidden), second), dim=1))
        hidden = self.up_block_3(torch.cat((self.up(hidden), first), dim=1))
        return self.sigmoid(self.predictor(hidden))
