# js-state-forms

use forms with @stembord/state and @stembord/state-react

## createFormsStore

```ts
// "./lib/stores/forms"
import { state, Consumer } from "../path/to/state";

export const {
  create,
  remove,
  selectForm,
  selectField,
  updateForm,
  setErrors,
  updateField,
  removeField,
  store,
  injectForm
} = createFormsStore(state, Consumer);
```

## Form

```tsx
// "./lib/components/Form"
import axios from "axios";
import { IInjectedFormProps } from "@stembord/state-forms";
import { injectForm } from "../path/to/forms";

// create a component that can be used with Field Component
const Input = ({
    value,
    error,
    errors,
    onChange,
    onBlur,
    onFocus
}: IInputProps) => (
    <div>
        <input
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
        />
        {error && <ul>
        {
            errors.map({ message } => (
                <li>{message}</li>
            ))
        }
        </ul>}
    </div>
);

interface IFormProps extends IInjectedFormProps {}

class Form extends React.PureComponent<IFormProps> {
    constructor(props: IFormProps) {
        super(props);

        this.onSubmit = this.onSubmit.bind(this);
    }
    onSubmit() {
        const { resetForm, getForm, setErrors } = this.props,
            values = getForm();

        // submit values to server
        axios
            .post("/form")
            .then(response => {
                // handle response, reset form
                resetForm();
            })
            .catch(response => {
                if (response.data) {
                    setErrors(response.data.errors);
                }
            });
    }
    render() {
        const { valid, Field } = this.props;

        return (
            <form>
                <Field name="name" Component={Input} />
                <Field name="age" Component={Input} />
                <input
                    type="submit"
                    onClick={onSubmit}
                    disabled={valid}
                    value="submit"
                />
            </form>
        );
    }
}

const ConnectedForm = injectForm({
    changeset: changeset => changeset
        .validateLength("age", { ">=": 13 })
        .validateRequired(["name", "age"])
})(Form);
```
