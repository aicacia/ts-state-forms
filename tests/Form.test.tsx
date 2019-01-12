import { State } from "@stembord/state";
import { createContext } from "@stembord/state-react";
import * as Enzyme from "enzyme";
import * as EnzymeAdapter from "enzyme-adapter-react-16";
import { Map, Record } from "immutable";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as tape from "tape";
import {
  createFormsStore,
  IForm,
  IInjectedFormProps,
  IInputProps
} from "../lib";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

(global as any).document = dom.window.document;
(global as any).window = dom.window;

const state = new State({ forms: Map<string, Record<IForm>>() }),
  { Consumer, Provider } = createContext(state.getState()),
  { selectField, injectForm } = createFormsStore(state, Consumer);

Enzyme.configure({ adapter: new EnzymeAdapter() });

interface ITestInputProps extends IInputProps {
  id: string;
  label: string;
}

class TestInput extends React.PureComponent<ITestInputProps> {
  render() {
    const {
      id,
      value,
      error,
      errors,
      label,
      onChange,
      onBlur,
      onFocus
    } = this.props;

    return (
      <div>
        <label>{label}</label>
        {error && errors.map(error => <span>{error.message}</span>)}
        <input
          id={id}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      </div>
    );
  }
}

const TestInputSFC = ({
  id,
  value,
  error,
  errors,
  label,
  onChange,
  onBlur,
  onFocus
}: ITestInputProps) => (
  <div>
    <label>{label}</label>
    {error && errors.map(error => <span>{error.message}</span>)}
    <input
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
    />
  </div>
);

interface IFormValues {
  firstName: string;
  lastName: string;
}
interface IFormProps extends IInjectedFormProps {
  defaults?: IFormValues;
}

class Form extends React.PureComponent<IFormProps> {
  render() {
    const { Field } = this.props;

    return (
      <form>
        <Field
          id="firstName"
          name="firstName"
          label="First Name"
          Component={TestInput}
        />
        <Field
          id="lastName"
          name="lastName"
          label="Last Name"
          Component={TestInputSFC}
        />
      </form>
    );
  }
}

const ConnectedForm = injectForm<IFormValues>({
  changeset: changeset => changeset
})(Form);

interface IRootState {
  value: typeof state.current;
}

class Root extends React.Component<{}, IRootState> {
  formRef: React.RefObject<any>;

  constructor(props: {}) {
    super(props);

    this.formRef = React.createRef();

    this.state = {
      value: state.getState()
    };

    state.on("set-state", value => {
      this.setState({ value });
    });
  }

  render() {
    return (
      <Provider value={this.state.value}>
        <ConnectedForm
          ref={this.formRef}
          defaults={{ firstName: "default", lastName: "default" }}
        />
      </Provider>
    );
  }
}

tape("connect update", (assert: tape.Test) => {
  const wrapper = Enzyme.mount(React.createElement(Root)),
    formId = (wrapper.instance() as Root).formRef.current.getFormId();

  assert.equals(
    ((wrapper.instance() as Root).formRef.current.constructor as any)
      .displayName,
    "Form(Form)",
    "should wrap component name"
  );

  assert.equals(
    selectField(state.getState(), formId, "firstName").get("value"),
    "default",
    "store's firstName value should the default"
  );
  wrapper
    .find("input#firstName")
    .simulate("change", { target: { value: "Billy" } });
  assert.equals(
    selectField(state.getState(), formId, "firstName").get("value"),
    "Billy",
    "store's firstName value should update"
  );

  assert.equals(
    selectField(state.getState(), formId, "lastName").get("value"),
    "default",
    "store's lastName value should the default"
  );
  wrapper
    .find("input#lastName")
    .simulate("change", { target: { value: "Bob" } });
  assert.equals(
    selectField(state.getState(), formId, "lastName").get("value"),
    "Bob",
    "store's lastName value should update"
  );

  assert.end();
});
