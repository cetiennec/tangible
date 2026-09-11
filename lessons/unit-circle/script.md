---
title: The unit circle
---

@scene(circle)
@chapter(On the circle)
@cue(theta = 0)
@board(cosine: $x = \cos\theta$)

On the unit circle, cosine is the red point's horizontal coordinate.
At zero degrees, it is one.
@cue(theta -> HALF_PI, over: 2s) Turn through ninety degrees, and the
point is directly above the center. Its cosine is zero.

@scene(cosine)
@chapter(Cosine as a graph)
@cue(theta = 0)
@clear(board)
@board(cosineGraph: $y = \cos\theta$)

Now we use a different view. The angle runs along the horizontal axis,
and the height gives its cosine.
@cue(theta -> TWO_PI, over: 6s, ease: linear) Over one full turn, the
cosine falls from one to minus one, then rises back to one.

@pause(prompt: "Move the angle slider and explore the curve.")

@scene(circle)
@chapter(Back to the circle)
@cue(theta = PI)
@clear(board)
@board(cosine: $x = \cos\theta$)

Back on the circle, a half turn puts the point on the left.
Its horizontal coordinate is minus one: the same minimum we saw on the graph.
