@scene(main)
@chapter(Introduction)

[[Placeholder. Link to lesson 101: inverse kinematics gives the target angles, and this lesson is about making each motor actually reach them.]]
This lesson is about control: how a motor reaches the angle we ask for.

@chapter(Open loop and closed loop)

[[Placeholder. Commanding a motor blindly versus measuring where it is and correcting.]]
First, we compare driving a motor blindly with correcting it as it moves.

@chapter(The proportional term)

[[Placeholder. The command grows with the error; show the overshoot and the steady error.]]
The first idea is to push harder the further we are from the target.
Then the push @cue(amount -> 80, over: 2s) grows with the error.

@pause(prompt: "Move the slider and watch how the response changes.")

@chapter(The integral term)

[[Placeholder. Accumulating past error removes the steady offset.]]
Next, we look at what the past error adds.

@chapter(The derivative term)

[[Placeholder. Reacting to how fast the error changes damps the overshoot.]]
Then, we look at how the speed of the error helps.

@chapter(Tuning a PID controller)

[[Placeholder. Trading speed, overshoot and stability when choosing the three gains.]]
Finally, we see how the three gains are chosen together.

@chapter(PID in a real robot arm)

[[Placeholder. Where PID loops run on a robot like the SO-101, and what LeRobot exposes.]]
To close, we see where this runs on a real robot arm.
