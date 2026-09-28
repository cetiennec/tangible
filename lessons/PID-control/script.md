@scene(main)
@chapter(Introduction)

In previous robotics 101 course you've seen how to control a robot geometrically. We saw different ways of generating target angles from another teleoperator (planning in the joint space) or from a controller outputting 3D positions or 3D speed (planning in the cartesian space).
But saying this, we've said nothing on how the motor actually reach its target orientation. 
As you might now, a motor is driven by its voltage and current, which translate eletrical power to mechanical power, but the electric signals to achieve a given position, speed or torque is not easy to compute as it might depend on the environment, this is exactly what PID control is about, come on let's dig into it.


Before jumping to PID control, let's meet our motor. The model of a DC motor is the following, defined by what's called the electric and the mechanical equations

@chapter(Open loop, feedforward and closed loop)


First, it's important to distinguish between what's called open-loop vs closed loop control.

When you appl

@chapter(The proportional term)

The first idea is to push harder the further we are from the target.
Then the push @cue(amount -> 80, over: 2s) grows with the error.

@pause(prompt: "Move the slider and watch how the response changes.")

@chapter(The integral term)

Next, we look at what the past error adds.

@chapter(The derivative term)

Then, we look at how the speed of the error helps.

@chapter(Tuning a PID controller)

[[Placeholder. Trading speed, overshoot and stability when choosing the three gains.]]
Finally, we see how the three gains are chosen together.

@chapter(PID in a real robot arm)

[[Placeholder. Where PID loops run on a robot like the SO-101, and what LeRobot exposes.]]
To close, we see where this runs on a real robot arm.
