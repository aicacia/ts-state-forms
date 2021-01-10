import { PureComponent, ReactNode, FormEvent, ComponentType } from "react";
import * as tape from "tape";
import { render } from "@testing-library/react";
import { Changeset, ChangesetError } from "@aicacia/changeset";
import { State } from "@aicacia/state";
import { createContext, createStateProvider } from "@aicacia/state-react";
import { Simulate } from "react-dom/test-utils";
import { JSDOM } from "jsdom";
import {
  createForms,
  selectField,
  selectForm,
  selectFormExists,
  selectFormErrors,
  selectFieldErrors,
  IInjectedFormProps,
  IFormProps,
  IInputProps,
  STORE_NAME,
  INITIAL_STATE,
  fromJSON,
} from ".";

const dom = new JSDOM();

(global as any).window = dom.window;
(global as any).document = dom.window.document;

const state = new State(
    { [STORE_NAME]: INITIAL_STATE },
    { [STORE_NAME]: fromJSON }
  ),
  { Consumer, Provider } = createContext(state.getCurrent()),
  { injectForm, addFormError, addFieldError, useForm } = createForms(
    state,
    Consumer
  );

interface ITestInputProps extends IInputProps<string> {
  label: ReactNode;
}

class TestInput extends PureComponent<ITestInputProps> {
  render() {
    return (
      <div>
        {this.props.focus && <span data-testid="focus">Focus</span>}
        <label>{this.props.label}</label>
        {this.props.error &&
          this.props.errors.map((error, index) => (
            <span className="error" key={index}>
              {error.get("message")}
            </span>
          ))}
        <input
          value={this.props.value || ""}
          onChange={this.props.onChange}
          onBlur={this.props.onBlur}
          onFocus={this.props.onFocus}
          data-testid="input"
        />
      </div>
    );
  }
}

interface ISelectInputProps<V> extends IInputProps<V> {
  label: ReactNode;
  children: ReactNode;
  getDisplayValue(value?: V): string;
}

function SelectInput<V>(props: ISelectInputProps<V>) {
  return (
    <div>
      <label>{props.label}</label>
      {props.error &&
        props.errors.map((error, index) => (
          <span className="error" key={index}>
            {error.get("message")}
          </span>
        ))}
      <select
        value={props.getDisplayValue(props.value)}
        onChange={props.onChange}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        data-testid="select"
      >
        {props.children}
      </select>
    </div>
  );
}

interface IGender {
  key: number;
  value: "Male" | "Female";
}

interface IFormValues {
  name: string;
  gender: IGender;
}

const GENDERS: IGender[] = [
  { key: 1, value: "Male" },
  { key: 2, value: "Female" },
];
function getGenderValue(e: FormEvent): IGender | undefined {
  return GENDERS.find((option) => option.key === (e.target as any).value);
}
function getGenderDisplayValue(gender?: IGender) {
  return gender ? gender.value : "";
}

class InjectedForm extends PureComponent<IInjectedFormProps<IFormValues>> {
  render() {
    const { formId, Field } = this.props;

    return (
      <form data-testid="form" data-formid={formId}>
        <Field name="name" label="Name" Component={TestInput} />
        <Field
          name="gender"
          label="Gender"
          getValue={getGenderValue}
          getDisplayValue={getGenderDisplayValue}
          Component={SelectInput as ComponentType<ISelectInputProps<IGender>>}
        >
          {GENDERS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.value}
            </option>
          ))}
        </Field>
      </form>
    );
  }
}

const ConnectedForm = injectForm<IFormValues>({
  timeout: 0,
  changeset: (changeset: Changeset<IFormValues>) =>
    changeset.validateRequired(["name", "gender"]),
})(InjectedForm);

function HookedForm(props: IFormProps<IFormValues>) {
  const { formId, Field } = useForm({
    ...props,
    timeout: 0,
    changeset: (changeset: Changeset<IFormValues>) =>
      changeset.validateRequired(["name", "gender"]),
  });

  return (
    <form data-testid="form" data-formid={formId}>
      <Field name="name" label="Name" Component={TestInput} />
      <Field
        name="gender"
        label="Gender"
        getValue={getGenderValue}
        getDisplayValue={getGenderDisplayValue}
        Component={SelectInput as ComponentType<ISelectInputProps<IGender>>}
      >
        {GENDERS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.value}
          </option>
        ))}
      </Field>
    </form>
  );
}

const StateProvider = createStateProvider(state, Provider, false);

tape("forms update callbacks", (assert: tape.Test) => {
  let onFormChangeCalled = 0,
    onFormChangeValidCalled = 0;

  const onFormChange = () => {
      onFormChangeCalled++;
    },
    onFormChangeValid = () => {
      onFormChangeValidCalled++;
    },
    wrapper = render(
      <StateProvider>
        <ConnectedForm
          onFormChange={onFormChange}
          onFormChangeValid={onFormChangeValid}
          defaults={{ name: "default", gender: GENDERS[0] }}
        />
      </StateProvider>
    ),
    formId = wrapper.getByTestId("form").dataset.formid as string;

  assert.equals(
    selectForm(state.getCurrent(), formId).valid,
    true,
    "form should be valid"
  );

  assert.equals(
    ConnectedForm.displayName,
    "Form(InjectedForm)",
    "should wrap component name"
  );

  assert.equals(
    selectField(state.getCurrent(), formId, "name").value,
    "default",
    "store's name not set to default"
  );
  Simulate.change(wrapper.getByTestId("input"), {
    target: { value: "Billy" } as any,
  });
  assert.equals(
    selectField(state.getCurrent(), formId, "name").value,
    "Billy",
    "store's name should update"
  );

  Simulate.focus(wrapper.getByTestId("input"), {});
  assert.true(wrapper.queryByTestId("focus"), "should focus input element");
  Simulate.blur(wrapper.getByTestId("input"), {});
  assert.false(wrapper.queryByTestId("focus"), "should blur input element");

  assert.deepEquals(
    selectField(state.getCurrent(), formId, "gender").value,
    GENDERS[0],
    "store's gender not set to default"
  );
  Simulate.change(wrapper.getByTestId("select"), {
    target: { value: 2 } as any,
  });
  assert.deepEquals(
    selectField(state.getCurrent(), formId, "gender").value,
    GENDERS[1],
    "store's gender should update"
  );

  Simulate.change(wrapper.getByTestId("input"), {
    target: { value: "" } as any,
  });
  assert.deepEquals(
    selectField(state.getCurrent(), formId, "name").errors.toJS(),
    [{ message: "required", values: [], meta: undefined }],
    "store's should have errors from changeset"
  );
  assert.false(
    selectForm(state.getCurrent(), formId).valid,
    "store's should not be valid"
  );

  addFormError(formId, ChangesetError({ message: "invalid", values: [] }));
  assert.deepEquals(
    selectFormErrors(state.getCurrent(), formId).toJS(),
    [{ message: "invalid", values: [], meta: undefined }],
    "store's should have errors from addFormError"
  );

  addFieldError(
    formId,
    "gender",
    ChangesetError({ message: "invalid_gender", values: [] })
  );
  assert.deepEquals(
    selectFieldErrors(state.getCurrent(), formId, "gender").toJS(),
    [{ message: "invalid_gender", values: [], meta: undefined }],
    "store's should have errors from addFieldError"
  );

  assert.equals(onFormChangeCalled, 4);
  assert.equals(onFormChangeValidCalled, 3);

  wrapper.unmount();

  assert.false(selectFormExists(state.getCurrent(), formId));
  assert.end();
});

tape("without defaults", (assert: tape.Test) => {
  const wrapper = render(
      <StateProvider>
        <ConnectedForm />
      </StateProvider>
    ),
    formId = wrapper.getByTestId("form").dataset.formid as string;

  assert.equals(
    selectForm(state.getCurrent(), formId).valid,
    false,
    "form should be invalid"
  );
  assert.equals(
    selectField(state.getCurrent(), formId, "name").value,
    null,
    "store's name not set"
  );

  wrapper.unmount();

  assert.false(selectFormExists(state.getCurrent(), formId));
  assert.end();
});

tape("useForm hook", (assert: tape.Test) => {
  let onFormChangeCalled = 0,
    onFormChangeValidCalled = 0;

  const onFormChange = () => {
      onFormChangeCalled++;
    },
    onFormChangeValid = () => {
      onFormChangeValidCalled++;
    },
    wrapper = render(
      <StateProvider>
        <HookedForm
          onFormChange={onFormChange}
          onFormChangeValid={onFormChangeValid}
        />
      </StateProvider>
    ),
    formId = wrapper.getByTestId("form").dataset.formid as string;

  assert.equals(
    selectForm(state.getCurrent(), formId).valid,
    false,
    "form should be invalid"
  );

  Simulate.change(wrapper.getByTestId("input"), {
    target: { value: "Billy" } as any,
  });
  assert.equals(
    selectField(state.getCurrent(), formId, "name").value,
    "Billy",
    "store's name should update"
  );

  Simulate.focus(wrapper.getByTestId("input"), {});
  assert.true(wrapper.queryByTestId("focus"), "should focus input element");
  Simulate.blur(wrapper.getByTestId("input"), {});
  assert.false(wrapper.queryByTestId("focus"), "should blur input element");

  Simulate.change(wrapper.getByTestId("select"), {
    target: { value: 2 } as any,
  });
  assert.deepEquals(
    selectField(state.getCurrent(), formId, "gender").value,
    GENDERS[1],
    "store's gender should update"
  );

  Simulate.change(wrapper.getByTestId("input"), {
    target: { value: "" } as any,
  });
  assert.deepEquals(
    selectField(state.getCurrent(), formId, "name").errors.toJS(),
    [{ message: "required", values: [], meta: undefined }],
    "store's should have errors from changeset"
  );
  assert.false(
    selectForm(state.getCurrent(), formId).valid,
    "store's should not be valid"
  );

  addFormError(formId, ChangesetError({ message: "invalid", values: [] }));
  assert.deepEquals(
    selectFormErrors(state.getCurrent(), formId).toJS(),
    [{ message: "invalid", values: [], meta: undefined }],
    "store's should have errors from addFormError"
  );

  addFieldError(
    formId,
    "gender",
    ChangesetError({ message: "invalid_gender", values: [] })
  );
  assert.deepEquals(
    selectFieldErrors(state.getCurrent(), formId, "gender").toJS(),
    [{ message: "invalid_gender", values: [], meta: undefined }],
    "store's should have errors from addFieldError"
  );

  assert.equals(onFormChangeCalled, 4);
  assert.equals(onFormChangeValidCalled, 3);

  wrapper.unmount();

  assert.false(selectFormExists(state.getCurrent(), formId));
  assert.end();
});

tape("rerender should not create new form", (assert: tape.Test) => {
  const wrapper = render(
      <StateProvider>
        <HookedForm />
      </StateProvider>
    ),
    formId = wrapper.getByTestId("form").dataset.formid as string;

  wrapper.rerender(
    <StateProvider>
      <HookedForm />
    </StateProvider>
  );
  assert.equals(formId, wrapper.getByTestId("form").dataset.formid);

  wrapper.unmount();

  assert.false(selectFormExists(state.getCurrent(), formId));
  assert.end();
});
